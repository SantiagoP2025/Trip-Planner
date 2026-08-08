// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { ItineraryItem } from '../types/api.ts';
import { DayMap, hasCoordinates, projectStops } from './DayMap.tsx';

afterEach(cleanup);

function stop(
  id: string,
  latitude: number | undefined,
  longitude: number | undefined,
  title = `Parada ${id}`,
): ItineraryItem {
  return {
    id,
    startTime: '2026-09-11T10:00:00.000Z',
    endTime: '2026-09-11T11:00:00.000Z',
    type: 'visit',
    title,
    durationMinutes: 60,
    latitude,
    longitude,
    verificationStatus: 'unverified',
  };
}

const TRES_PARADAS = [
  stop('a', 38.71, -9.14, 'Museo'),
  stop('b', 38.72, -9.13, 'Mirador'),
  stop('c', 38.73, -9.16, 'Playa'),
];

const lienzo = () => screen.getByTestId('mapa-lienzo');

describe('hasCoordinates', () => {
  it('acepta una parada con las dos coordenadas', () => {
    expect(hasCoordinates(stop('a', 38.7, -9.1))).toBe(true);
  });

  // Las comidas no traen coordenadas: no hay proveedor de restaurantes. Que no
  // salgan en el mapa es la alternativa correcta a ponerlas en un sitio inventado.
  it('descarta una parada a la que le falta alguna', () => {
    expect(hasCoordinates(stop('a', 38.7, undefined))).toBe(false);
    expect(hasCoordinates(stop('a', undefined, -9.1))).toBe(false);
    expect(hasCoordinates(stop('a', undefined, undefined))).toBe(false);
  });
});

describe('projectStops', () => {
  it('sitúa cada parada dentro del lienzo', () => {
    for (const punto of projectStops(TRES_PARADAS)) {
      expect(punto.x).toBeGreaterThanOrEqual(0);
      expect(punto.x).toBeLessThanOrEqual(1000);
      expect(punto.y).toBeGreaterThanOrEqual(0);
      expect(punto.y).toBeLessThanOrEqual(1000);
    }
  });

  it('numera las paradas en el orden en que llegan', () => {
    expect(projectStops(TRES_PARADAS).map((punto) => punto.order)).toEqual([1, 2, 3]);
  });

  // El norte arriba: la latitud crece hacia arriba y la Y del SVG hacia abajo.
  it('pone más arriba lo que está más al norte', () => {
    const [sur, norte] = projectStops([stop('sur', 38.70, -9.14), stop('norte', 38.75, -9.14)]);

    expect(norte?.y).toBeLessThan(sur?.y ?? 0);
  });

  it('pone más a la derecha lo que está más al este', () => {
    const [oeste, este] = projectStops([stop('oeste', 38.71, -9.20), stop('este', 38.71, -9.10)]);

    expect(este?.x).toBeGreaterThan(oeste?.x ?? 0);
  });

  // Si cada eje se estirara a su propio rango, dos paradas casi alineadas
  // saldrían en esquinas opuestas y el esquema diría algo falso sobre la ciudad.
  it('usa la misma escala en los dos ejes', () => {
    const puntos = projectStops([
      stop('a', 38.70, -9.20),
      stop('b', 38.71, -9.20),
      stop('c', 38.70, -9.10),
    ]);

    const distanciaVertical = Math.abs((puntos[1]?.y ?? 0) - (puntos[0]?.y ?? 0));
    const distanciaHorizontal = Math.abs((puntos[2]?.x ?? 0) - (puntos[0]?.x ?? 0));

    // Diez veces más lejos en longitud que en latitud tiene que dibujarse más
    // lejos. Si cada eje se estirara a su propio rango, los dos ocuparían el
    // lienzo entero y estas dos distancias saldrían parecidas.
    expect(distanciaHorizontal).toBeGreaterThan(distanciaVertical * 2);
  });

  // Sin esto la división daría infinito y las chinchetas desaparecerían.
  it('no revienta con una sola parada', () => {
    const [punto] = projectStops([stop('a', 38.71, -9.14)]);

    expect(Number.isFinite(punto?.x)).toBe(true);
    expect(Number.isFinite(punto?.y)).toBe(true);
  });

  it('no revienta con paradas en línea recta', () => {
    const puntos = projectStops([stop('a', 38.71, -9.14), stop('b', 38.75, -9.14)]);

    for (const punto of puntos) {
      expect(Number.isFinite(punto.x)).toBe(true);
      expect(Number.isFinite(punto.y)).toBe(true);
    }
  });

  it('ignora las paradas sin coordenadas', () => {
    const puntos = projectStops([stop('a', 38.71, -9.14), stop('comida', undefined, undefined)]);

    expect(puntos).toHaveLength(1);
  });
});

describe('DayMap', () => {
  it('dibuja una chincheta numerada por parada', () => {
    render(<DayMap items={TRES_PARADAS} dayKey="2026-09-11" />);

    expect(screen.getAllByTestId('mapa-parada')).toHaveLength(3);
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('une las paradas con una línea en orden de visita', () => {
    const { container } = render(<DayMap items={TRES_PARADAS} dayKey="2026-09-11" />);
    const linea = container.querySelector('polyline');

    expect(linea).not.toBeNull();
    expect(linea?.getAttribute('points')?.split(' ')).toHaveLength(3);
  });

  it('no dibuja línea si solo hay una parada', () => {
    const { container } = render(
      <DayMap items={[stop('a', 38.71, -9.14)]} dayKey="2026-09-11" />,
    );

    expect(container.querySelector('polyline')).toBeNull();
    expect(screen.getAllByTestId('mapa-parada')).toHaveLength(1);
  });

  it('cada chincheta dice a dónde se va, no solo su número', () => {
    const { container } = render(<DayMap items={TRES_PARADAS} dayKey="2026-09-11" />);

    expect(container.querySelector('title')?.textContent).toBe('1. Museo');
  });

  // Prueba obligatoria de la fase: día sin paradas no rompe nada.
  it('no renderiza nada si el día no tiene paradas', () => {
    const { container } = render(<DayMap items={[]} dayKey="2026-09-11" />);

    expect(container.innerHTML).toBe('');
  });

  it('tampoco renderiza nada si ninguna parada trae coordenadas', () => {
    const { container } = render(
      <DayMap items={[stop('comida', undefined, undefined)]} dayKey="2026-09-11" />,
    );

    expect(container.innerHTML).toBe('');
  });

  // Regla 12 de PLAN-2.md y fallo B.1 de la auditoría. Las coordenadas de hoy
  // son simuladas: dibujarlas sobre teselas reales enseñaría un pueblo húngaro
  // a quien ha buscado Tokio. Este test es lo que impide que alguien añada una
  // capa de teselas "solo para que se vea mejor".
  describe('sin mapa real debajo (regla 12)', () => {
    it('no carga ninguna tesela ni recurso externo', () => {
      const { container } = render(<DayMap items={TRES_PARADAS} dayKey="2026-09-11" />);

      expect(container.querySelectorAll('img')).toHaveLength(0);
      expect(container.querySelectorAll('iframe')).toHaveLength(0);
      expect(container.querySelector('image')).toBeNull();
      expect(container.innerHTML).not.toContain('http://');
      expect(container.innerHTML).not.toContain('https://');
    });

    it('avisa al usuario de que el fondo no es un mapa real', () => {
      render(<DayMap items={TRES_PARADAS} dayKey="2026-09-11" />);

      expect(screen.getByText(/no su ubicación sobre un mapa real/)).toBeTruthy();
    });
  });

  describe('encuadre (regla 13)', () => {
    const transform = () => lienzo().getAttribute('transform') ?? '';

    it('empieza encuadrado', () => {
      render(<DayMap items={TRES_PARADAS} dayKey="2026-09-11" />);

      expect(transform()).toContain('scale(1)');
    });

    // Prueba obligatoria de la fase: cambiar de día reencuadra.
    it('cambiar de día devuelve el mapa a su encuadre', async () => {
      const { rerender } = render(<DayMap items={TRES_PARADAS} dayKey="2026-09-11" />);

      await userEvent.setup().click(screen.getByRole('button', { name: 'Acercar' }));
      expect(transform()).not.toContain('scale(1)');

      rerender(<DayMap items={TRES_PARADAS} dayKey="2026-09-12" />);

      expect(transform()).toContain('scale(1)');
    });

    // Prueba obligatoria de la fase, y el fallo B.2 de la auditoría: el array de
    // paradas se reconstruye en cada render. Si fuera dependencia del efecto de
    // encuadre, el mapa se recolocaría solo y el usuario no podría moverlo.
    it('un render nuevo con las mismas paradas no lo reencuadra', async () => {
      const { rerender } = render(<DayMap items={TRES_PARADAS} dayKey="2026-09-11" />);

      await userEvent.setup().click(screen.getByRole('button', { name: 'Acercar' }));
      const despuesDeAcercar = transform();

      // Un array nuevo con el mismo contenido: exactamente lo que produce el
      // padre en cada render.
      rerender(<DayMap items={[...TRES_PARADAS]} dayKey="2026-09-11" />);

      expect(transform()).toBe(despuesDeAcercar);
    });

    it('acercar y alejar cambian el encuadre en sentidos opuestos', async () => {
      render(<DayMap items={TRES_PARADAS} dayKey="2026-09-11" />);
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'Acercar' }));
      const acercado = transform();
      await user.click(screen.getByRole('button', { name: 'Alejar' }));

      expect(transform()).not.toBe(acercado);
      expect(transform()).toContain('scale(1)');
    });

    it('el botón de centrar devuelve el encuadre', async () => {
      render(<DayMap items={TRES_PARADAS} dayKey="2026-09-11" />);
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'Acercar' }));
      await user.click(screen.getByRole('button', { name: 'Acercar' }));
      await user.click(screen.getByRole('button', { name: 'Centrar' }));

      expect(transform()).toContain('scale(1)');
    });

    it('no se puede alejar más allá del encuadre inicial', async () => {
      render(<DayMap items={TRES_PARADAS} dayKey="2026-09-11" />);
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'Alejar' }));
      await user.click(screen.getByRole('button', { name: 'Alejar' }));

      expect(transform()).toContain('scale(1)');
    });
  });
});
