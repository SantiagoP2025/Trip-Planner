// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, OBJECT_URL_REVOKE_DELAY_MS } from './download-blob.ts';

const URL_FALSA = 'blob:falsa';

let crear: ReturnType<typeof vi.fn>;
let revocar: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  crear = vi.fn(() => URL_FALSA);
  revocar = vi.fn();
  vi.stubGlobal('URL', { ...URL, createObjectURL: crear, revokeObjectURL: revocar });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('downloadBlob', () => {
  it('dispara la descarga con el nombre de fichero que se le da', () => {
    const clics: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clics.push(this);
    });

    downloadBlob(new Blob(['x'], { type: 'application/pdf' }), 'viaje-lisboa.pdf');

    expect(clics).toHaveLength(1);
    expect(clics[0]?.download).toBe('viaje-lisboa.pdf');
    expect(clics[0]?.href).toBe(URL_FALSA);
  });

  // Fallo B.8 de la auditoría: revocar la URL en la misma vuelta de eventos que
  // el clic hace que Safari cancele la descarga a medias. El usuario ve un botón
  // que unas veces funciona y otras no.
  it('no revoca la URL en la misma vuelta de eventos que el clic', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBlob(new Blob(['x']), 'viaje.pdf');

    expect(crear).toHaveBeenCalledTimes(1);
    expect(revocar).not.toHaveBeenCalled();
  });

  // Pero revocarla en algún momento no es opcional: mientras la URL viva, el
  // navegador mantiene el fichero entero en memoria.
  it('la revoca pasado el retraso', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBlob(new Blob(['x']), 'viaje.pdf');
    vi.advanceTimersByTime(OBJECT_URL_REVOKE_DELAY_MS);

    expect(revocar).toHaveBeenCalledWith(URL_FALSA);
  });

  it('no deja el enlace colgado del documento', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBlob(new Blob(['x']), 'viaje.pdf');

    expect(document.querySelectorAll('a')).toHaveLength(0);
  });
});
