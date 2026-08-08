// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { ItineraryDay, ItineraryItem } from '../types/api.ts';
import { DayByDay } from './DayByDay.tsx';

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
