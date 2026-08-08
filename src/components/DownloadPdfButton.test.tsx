// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadPdfButton } from './DownloadPdfButton.tsx';
import { buildProposal, SUMMARY } from '../services/pdf/test-fixtures.ts';

// Se sustituyen los dos módulos de abajo porque lo que se prueba aquí son los
// tres estados del botón, no el PDF: generarlo de verdad en cada caso serían
// segundos por test para comprobar algo que ya comprueba `render-trip-pdf.test.ts`.
vi.mock('../services/pdf/render-trip-pdf.ts', () => ({
  renderTripPdf: vi.fn(),
}));
vi.mock('../services/pdf/download-blob.ts', () => ({
  downloadBlob: vi.fn(),
}));

const { renderTripPdf } = await import('../services/pdf/render-trip-pdf.ts');
const { downloadBlob } = await import('../services/pdf/download-blob.ts');

const generar = vi.mocked(renderTripPdf);
const descargar = vi.mocked(downloadBlob);

beforeEach(() => {
  vi.clearAllMocks();
  // El botón registra el detalle en la consola y el mensaje en pantalla; en el
  // test solo estorba.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderButton() {
  render(<DownloadPdfButton summary={SUMMARY} proposal={buildProposal()} />);
  return screen.getByRole('button', { name: 'Descargar en PDF' });
}

describe('DownloadPdfButton', () => {
  it('descarga el PDF con el nombre del viaje', async () => {
    const blob = new Blob(['%PDF-'], { type: 'application/pdf' });
    generar.mockResolvedValue(blob);

    await userEvent.setup().click(renderButton());

    await waitFor(() => expect(descargar).toHaveBeenCalledTimes(1));
    expect(descargar).toHaveBeenCalledWith(blob, 'viaje-valencia-lisboa-2026-09-10.pdf');
    expect(await screen.findByText('Descarga iniciada.')).toBeTruthy();
  });

  // Regla 15, primer estado: mientras se prepara, se ve que se está preparando.
  it('avisa mientras prepara el documento', async () => {
    let terminar: (blob: Blob) => void = () => {};
    generar.mockImplementation(
      () => new Promise<Blob>((resolve) => { terminar = resolve; }),
    );

    const boton = renderButton();
    await userEvent.setup().click(boton);

    expect(screen.getByRole('button', { name: 'Preparando el PDF…' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Preparando el documento…');
    // Y no se puede pulsar dos veces: dos PDF a la vez no ayudan a nadie.
    expect(screen.getByRole('button')).toHaveProperty('disabled', true);

    terminar(new Blob(['%PDF-']));
    await waitFor(() => expect(descargar).toHaveBeenCalled());
  });

  // Regla 15 y fallo B.9 de la auditoría: allí el bloque era `try/finally` sin
  // `catch`. Si la generación fallaba, el indicador desaparecía y no pasaba nada
  // más: el usuario concluía que el botón no funcionaba.
  it('enseña el error si la generación falla', async () => {
    generar.mockRejectedValue(new Error('toBlob ha fallado'));

    await userEvent.setup().click(renderButton());

    const aviso = await screen.findByRole('alert');
    expect(aviso.textContent).toContain('No hemos podido preparar el PDF');
    // Al usuario, sin detalles técnicos; el detalle va al log del navegador.
    expect(aviso.textContent).not.toContain('toBlob');
    expect(descargar).not.toHaveBeenCalled();
  });

  it('deja volver a intentarlo después de un fallo', async () => {
    const user = userEvent.setup();
    generar.mockRejectedValueOnce(new Error('vaya'));

    const boton = renderButton();
    await user.click(boton);
    await screen.findByRole('alert');

    generar.mockResolvedValue(new Blob(['%PDF-']));
    await user.click(screen.getByRole('button', { name: 'Descargar en PDF' }));

    await waitFor(() => expect(descargar).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('si la descarga en sí falla, también se dice', async () => {
    generar.mockResolvedValue(new Blob(['%PDF-']));
    descargar.mockImplementation(() => {
      throw new Error('sin permiso');
    });

    await userEvent.setup().click(renderButton());

    expect((await screen.findByRole('alert')).textContent).toContain(
      'No hemos podido preparar el PDF',
    );
  });
});
