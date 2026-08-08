// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItineraryDay, ItineraryItem } from '../types/api.ts';
import { DayByDay, type ItineraryEditing } from './DayByDay.tsx';

afterEach(cleanup);

function item(overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  return {
    id: 'item-1',
    startTime: '2026-09-11T10:00:00.000Z',
    endTime: '2026-09-11T11:30:00.000Z',
    type: 'visit',
    title: 'Museo de la ciudad',
    durationMinutes: 90,
    verificationStatus: 'verified',
    ...overrides,
  };
}

function day(items: ItineraryItem[], date = '2026-09-11'): ItineraryDay {
  return { date, items };
}

describe('DayByDay', () => {
  it('pinta cada parada con su hora y su título', () => {
    render(<DayByDay days={[day([item()])]} currency="EUR" />);

    expect(screen.getByText('Museo de la ciudad')).toBeTruthy();
    expect(screen.getByText('10:00–11:30')).toBeTruthy();
  });

  // El itinerario de una semana en una sola lista no se lee, y el mapa es "el
  // mapa del día seleccionado": hace falta que haya un día seleccionado.
  it('enseña un día cada vez, empezando por el primero', () => {
    render(
      <DayByDay
        days={[
          day([item({ id: 'a', title: 'Primero' })], '2026-09-11'),
          day([item({ id: 'b', title: 'Segundo' })], '2026-09-12'),
        ]}
        currency="EUR"
      />,
    );

    expect(screen.getByText('11 de septiembre de 2026')).toBeTruthy();
    expect(screen.getByText('Primero')).toBeTruthy();
    expect(screen.queryByText('Segundo')).toBeNull();
  });

  it('deja cambiar de día', async () => {
    render(
      <DayByDay
        days={[
          day([item({ id: 'a', title: 'Primero' })], '2026-09-11'),
          day([item({ id: 'b', title: 'Segundo' })], '2026-09-12'),
        ]}
        currency="EUR"
      />,
    );

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Día 2' }));

    expect(screen.getByText('12 de septiembre de 2026')).toBeTruthy();
    expect(screen.getByText('Segundo')).toBeTruthy();
    expect(screen.queryByText('Primero')).toBeNull();
  });

  // Un itinerario que cambia —otra búsqueda, otra propuesta— no puede dejar
  // seleccionada una fecha que ya no existe.
  it('vuelve al primer día si el itinerario cambia por completo', () => {
    const { rerender } = render(
      <DayByDay days={[day([item({ id: 'a', title: 'Primero' })], '2026-09-11')]} currency="EUR" />,
    );

    rerender(
      <DayByDay days={[day([item({ id: 'z', title: 'Otro viaje' })], '2027-01-05')]} currency="EUR" />,
    );

    expect(screen.getByText('Otro viaje')).toBeTruthy();
  });

  it('dice cuánto se tarda en llegar cuando el backend lo manda', () => {
    render(<DayByDay days={[day([item({ travelMinutesFromPrevious: 25 })])]} currency="EUR" />);

    expect(screen.getByText(/25 min para llegar/)).toBeTruthy();
  });

  it('no habla de desplazamiento cuando no lo hay', () => {
    render(<DayByDay days={[day([item()])]} currency="EUR" />);

    expect(screen.queryByText(/para llegar/)).toBeNull();
  });

  it('enseña el precio por persona en la moneda del viaje', () => {
    render(<DayByDay days={[day([item({ costPerPerson: 18 })])]} currency="EUR" />);

    expect(screen.getByText(/por persona/)).toBeTruthy();
  });

  // Sección 12.1: "Marcar datos no verificados". Lo estimado se dice, no se
  // disimula: es la diferencia entre una propuesta y una promesa.
  it('avisa de lo que no está verificado, con la nota del servidor', () => {
    render(
      <DayByDay
        days={[
          day([
            item({
              type: 'meal',
              title: 'Comida',
              verificationStatus: 'unverified',
              notes: ['Es una sugerencia de horario: todavía no proponemos ningún restaurante.'],
            }),
          ]),
        ]}
        currency="EUR"
      />,
    );

    expect(screen.getByText(/no proponemos ningún restaurante/)).toBeTruthy();
  });

  it('no marca como estimado lo que sí está verificado', () => {
    render(<DayByDay days={[day([item({ verificationStatus: 'verified' })])]} currency="EUR" />);

    expect(screen.queryByText(/pendiente de confirmar/)).toBeNull();
  });

  it('avisa de las visitas que necesitan reserva', () => {
    render(<DayByDay days={[day([item({ bookingRequired: true })])]} currency="EUR" />);

    expect(screen.getByText('Requiere reserva previa.')).toBeTruthy();
  });

  // Un día sin plan es un día libre, no un fallo.
  it('dice que el día está libre en vez de dejarlo en blanco', () => {
    render(<DayByDay days={[day([])]} currency="EUR" />);

    expect(screen.getByText('Día libre, sin nada programado.')).toBeTruthy();
  });

  it('no pinta nada si no hay itinerario', () => {
    const { container } = render(<DayByDay days={[]} currency="EUR" />);

    expect(container.textContent).toBe('');
  });

  // Regla 1 de CLAUDE.md: este componente pinta lo que llega y en el orden que
  // llega. No reordena, no completa y no calcula.
  it('respeta el orden que manda el servidor', () => {
    render(
      <DayByDay
        days={[
          day([
            item({ id: 'a', title: 'Segunda', startTime: '2026-09-11T15:00:00.000Z' }),
            item({ id: 'b', title: 'Primera', startTime: '2026-09-11T09:00:00.000Z' }),
          ]),
        ]}
        currency="EUR"
      />,
    );

    const titulos = screen.getAllByText(/Primera|Segunda/).map((node) => node.textContent);
    expect(titulos).toEqual(['Segunda', 'Primera']);
  });
});

// ---------------------------------------------------------------------------
// Edición del itinerario (fase 11)
// ---------------------------------------------------------------------------

const ORIGINAL = item({ id: 'bloque-1', title: 'Cena', description: 'Sin restaurante asignado' });

function editingProps(overrides: Partial<ItineraryEditing> = {}): ItineraryEditing {
  return {
    edits: [],
    save: async () => {},
    revert: async () => {},
    ...overrides,
  };
}

function renderEditable(editing: ItineraryEditing, items: ItineraryItem[] = [ORIGINAL]) {
  return render(<DayByDay days={[day(items)]} currency="EUR" editing={editing} />);
}

describe('DayByDay — edición', () => {
  // Depende de la fase 8: sin viaje guardado no hay dónde guardar lo que el
  // usuario escriba, así que ni se ofrece.
  it('no ofrece editar si la pantalla no lo permite', () => {
    render(<DayByDay days={[day([ORIGINAL])]} currency="EUR" />);

    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  });

  it('ofrece editar cuando hay dónde guardar', () => {
    renderEditable(editingProps());

    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
  });

  it('el formulario abre con lo que el usuario está viendo', async () => {
    renderEditable(editingProps());

    await userEvent.setup().click(screen.getByRole('button', { name: 'Editar' }));

    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Cena');
    expect((screen.getByLabelText('Notas') as HTMLTextAreaElement).value).toBe(
      'Sin restaurante asignado',
    );
  });

  it('manda al servidor lo que el usuario escribe', async () => {
    const save = vi.fn(async () => {});
    renderEditable(editingProps({ save }));
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.clear(screen.getByLabelText('Título'));
    await user.type(screen.getByLabelText('Título'), 'La Tasquita');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(save).toHaveBeenCalledWith('bloque-1', {
      title: 'La Tasquita',
      description: 'Sin restaurante asignado',
    });
  });

  it('cierra el formulario cuando el guardado va bien', async () => {
    renderEditable(editingProps());
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.queryByLabelText('Título')).toBeNull());
  });

  it('cancelar cierra el formulario sin guardar', async () => {
    const save = vi.fn(async () => {});
    renderEditable(editingProps({ save }));
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.type(screen.getByLabelText('Título'), 'algo');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Título')).toBeNull();
  });

  // Prueba obligatoria de la fase: un fallo al guardar avisa al usuario.
  it('enseña el error si el guardado falla, y no cierra el formulario', async () => {
    const save = vi.fn(() => Promise.reject(new Error('No hemos podido guardar el cambio.')));
    renderEditable(editingProps({ save }));
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('No hemos podido guardar el cambio.')).toBeTruthy();
    // El formulario sigue abierto: perder lo escrito sería el fallo B.5 otra vez.
    expect(screen.getByLabelText('Título')).toBeTruthy();
  });

  describe('lo editado se distingue de lo original', () => {
    const CON_EDICION = editingProps({
      edits: [{ itemId: 'bloque-1', title: 'La Tasquita', updatedAt: '2026-08-08T12:00:00.000Z' }],
    });

    it('enseña el texto editado en vez del original', () => {
      renderEditable(CON_EDICION);

      expect(screen.getByText('La Tasquita')).toBeTruthy();
      expect(screen.queryByText('Cena')).toBeNull();
    });

    // No basta con la cursiva: quien no distingue tipografías necesita el texto.
    it('lo marca con un texto, no solo con un estilo', () => {
      renderEditable(CON_EDICION);

      expect(screen.getByText('Editado por ti')).toBeTruthy();
    });

    it('no marca como editado lo que nadie ha tocado', () => {
      renderEditable(editingProps());

      expect(screen.queryByText('Editado por ti')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Volver al original' })).toBeNull();
    });

    // Prueba obligatoria de la fase: se puede volver al original.
    it('deja volver al original', async () => {
      const revert = vi.fn(async () => {});
      renderEditable(editingProps({ ...CON_EDICION, revert }));

      await userEvent.setup().click(screen.getByRole('button', { name: 'Volver al original' }));

      expect(revert).toHaveBeenCalledWith('bloque-1');
    });

    it('avisa si volver al original falla', async () => {
      const revert = vi.fn(() => Promise.reject(new Error('No hemos podido deshacerlo.')));
      renderEditable(editingProps({ ...CON_EDICION, revert }));

      await userEvent.setup().click(screen.getByRole('button', { name: 'Volver al original' }));

      expect(await screen.findByText('No hemos podido deshacerlo.')).toBeTruthy();
    });

    it('el formulario abre con el texto editado, no con el original', async () => {
      renderEditable(CON_EDICION);

      await userEvent.setup().click(screen.getByRole('button', { name: 'Editar' }));

      expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('La Tasquita');
    });

    it('solo marca el bloque editado, no todos', () => {
      renderEditable(CON_EDICION, [ORIGINAL, item({ id: 'bloque-2', title: 'Visita' })]);

      expect(screen.getAllByText('Editado por ti')).toHaveLength(1);
    });
  });
});
