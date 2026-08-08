// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider.tsx';
import Home from './Home.tsx';

afterEach(cleanup);

// Fase 14: las etiquetas del formulario son preguntas ("¿Desde dónde sales?" en
// vez de "Origen"), y el estilo de viaje y las preferencias ya no son un
// desplegable y ocho barras sino etiquetas de equipaje. Lo que cambió es cómo se
// llaman y cómo se pulsan los controles, así que lo que cambia aquí son los
// selectores. Las comprobaciones son las mismas: los mismos campos, los mismos
// parámetros en la URL y los mismos avisos.

const NOMBRE_DEL_BOTON = 'Buscar mi viaje ideal';

// Pantalla espía: enseña la URL a la que se ha navegado, para comprobar que el
// formulario manda la búsqueda a `/results` en vez de pedirla él mismo.
function LocationSpy() {
  const location = useLocation();
  return <div data-testid="destino">{`${location.pathname}${location.search}`}</div>;
}

// La barra de sesión de la cabecera necesita el contexto de autenticación. Sin
// cuentas configuradas, que es lo que hace este doble, no pinta nada: lo que se
// prueba aquí es el formulario.
function renderHome() {
  return render(
    <AuthProvider createGateway={async () => null}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/results" element={<LocationSpy />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

async function fillTrayecto(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('¿Desde dónde sales?'), 'Valencia');
  await user.type(screen.getByLabelText('¿A dónde te apetece ir?'), 'Lisboa');
}

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: NOMBRE_DEL_BOTON }));
}

describe('Formulario de búsqueda', () => {
  it('pinta los campos de la sección 5', () => {
    renderHome();

    expect(screen.getByLabelText('¿Desde dónde sales?')).toBeTruthy();
    expect(screen.getByLabelText('¿A dónde te apetece ir?')).toBeTruthy();
    expect(screen.getByLabelText('¿Cuándo os vais?')).toBeTruthy();
    expect(screen.getByLabelText('¿Cuándo volvéis?')).toBeTruthy();
    expect(screen.getByLabelText('¿Cuántos adultos viajáis?')).toBeTruthy();
    expect(screen.getByLabelText('¿Cuál es tu presupuesto total?')).toBeTruthy();
    expect(screen.getByLabelText('¿En qué moneda?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Equilibrado' })).toBeTruthy();
  });

  it('ofrece las ocho preferencias de la sección 6', () => {
    renderHome();

    for (const label of [
      'Playa',
      'Cultura',
      'Gastronomía',
      'Vida nocturna',
      'Naturaleza',
      'Compras',
      'Familia',
      'Relax',
    ]) {
      // El nombre accesible lleva el nivel detrás: "Playa, nivel 1 de 3".
      expect(screen.getByRole('button', { name: new RegExp(`^${label},`) })).toBeTruthy();
    }
  });

  // Criterio de aceptación de la sección 17.3: "El formulario envía TripRequest
  // válido". Y regla 1: envía, no genera.
  it('navega a los resultados con la búsqueda en la URL', async () => {
    const user = userEvent.setup();
    renderHome();

    await fillTrayecto(user);
    await submit(user);

    const destino = await screen.findByTestId('destino');
    expect(destino.textContent).toContain('/results?');
    expect(destino.textContent).toContain('origin=Valencia');
    expect(destino.textContent).toContain('destination=Lisboa');
    expect(destino.textContent).toContain('pref.culture=');
  });

  it('lleva el estilo de viaje y la moneda elegidos', async () => {
    const user = userEvent.setup();
    renderHome();

    await fillTrayecto(user);
    await user.click(screen.getByRole('button', { name: 'Cómodo' }));
    await user.selectOptions(screen.getByLabelText('¿En qué moneda?'), 'GBP');
    await submit(user);

    const destino = await screen.findByTestId('destino');
    expect(destino.textContent).toContain('travelStyle=comfort');
    expect(destino.textContent).toContain('currency=GBP');
  });

  it('marca la maleta facturada solo si se pide', async () => {
    const user = userEvent.setup();
    renderHome();

    await fillTrayecto(user);
    await user.click(screen.getByLabelText('Necesito maleta facturada'));
    await submit(user);

    expect((await screen.findByTestId('destino')).textContent).toContain('checkedBaggage=1');
  });

  // Regla 5: que el formulario valide lo mismo es un extra para la experiencia
  // de usuario. Aquí se comprueba que ese extra existe y se ve.
  it('no navega y avisa cuando falta el origen', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.type(screen.getByLabelText('¿A dónde te apetece ir?'), 'Lisboa');
    await submit(user);

    expect(screen.queryByTestId('destino')).toBeNull();
    expect(screen.getByLabelText('¿Desde dónde sales?').getAttribute('aria-invalid')).toBe('true');
  });

  it('enseña el motivo debajo del campo que falla', async () => {
    const user = userEvent.setup();
    renderHome();

    await fillTrayecto(user);
    await user.clear(screen.getByLabelText('¿Cuál es tu presupuesto total?'));
    await user.type(screen.getByLabelText('¿Cuál es tu presupuesto total?'), '0');
    await submit(user);

    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((alert) => alert.textContent?.includes('mayor que 0'))).toBe(true);
  });

  // Un `aria-describedby` que apunta a un identificador inexistente es peor que
  // no ponerlo: el lector de pantalla no lee nada y nadie se entera.
  it('ata el mensaje de error al campo con un identificador que existe', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.type(screen.getByLabelText('¿A dónde te apetece ir?'), 'Lisboa');
    await user.clear(screen.getByLabelText('¿Cuántos adultos viajáis?'));
    await user.type(screen.getByLabelText('¿Cuántos adultos viajáis?'), '99');
    await submit(user);

    for (const label of ['¿Desde dónde sales?', '¿Cuántos adultos viajáis?']) {
      const input = screen.getByLabelText(label);
      const describedBy = input.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy as string)).not.toBeNull();
    }
  });

  it('resume cuántos campos hay que revisar', async () => {
    const user = userEvent.setup();
    renderHome();

    await submit(user);

    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((alert) => alert.textContent?.includes('Revisa los campos'))).toBe(true);
  });
});

// Fase 14. Las preferencias son el punto donde la referencia y este motor no
// encajan: allí son un interruptor y aquí un perfil de niveles de 0 a 3, que es
// lo que pide la sección 6.2 y lo que consume el algoritmo de afinidad. Se copia
// el aspecto —la etiqueta de equipaje— pero cada clic sube el nivel en vez de
// encender y apagar. Estos tests son los que impiden que alguien "simplifique"
// eso a un booleano y le tire al motor la mitad de la información.
describe('Preferencias por niveles', () => {
  function tagDe(label: string) {
    return screen.getByRole('button', { name: new RegExp(`^${label},`) });
  }

  it('sube de nivel a cada clic y vuelve a cero al pasarse', async () => {
    const user = userEvent.setup();
    renderHome();

    // Compras arranca en 0, que es el estado sin seleccionar.
    expect(tagDe('Compras').getAttribute('aria-label')).toBe('Compras, nivel 0 de 3');
    expect(tagDe('Compras').getAttribute('aria-pressed')).toBe('false');

    await user.click(tagDe('Compras'));
    expect(tagDe('Compras').getAttribute('aria-label')).toBe('Compras, nivel 1 de 3');
    expect(tagDe('Compras').getAttribute('aria-pressed')).toBe('true');

    await user.click(tagDe('Compras'));
    await user.click(tagDe('Compras'));
    expect(tagDe('Compras').getAttribute('aria-label')).toBe('Compras, nivel 3 de 3');

    // De 3 vuelve a 0: sin esto no habría forma de apagar una preferencia.
    await user.click(tagDe('Compras'));
    expect(tagDe('Compras').getAttribute('aria-label')).toBe('Compras, nivel 0 de 3');
    expect(tagDe('Compras').getAttribute('aria-pressed')).toBe('false');
  });

  // Lo que llega al backend sigue siendo el nivel, no un sí o un no. Es la
  // comprobación que da sentido a la fase entera: el aspecto cambió, el dato no.
  it('manda el nivel al backend, no un booleano', async () => {
    const user = userEvent.setup();
    renderHome();

    await fillTrayecto(user);
    // Compras: de 0 a 2.
    await user.click(tagDe('Compras'));
    await user.click(tagDe('Compras'));
    await submit(user);

    const destino = await screen.findByTestId('destino');
    expect(destino.textContent).toContain('pref.shopping=2');
    // Y una que no se ha tocado conserva su nivel inicial, que no es ni 0 ni 1.
    expect(destino.textContent).toContain('pref.culture=2');
  });
});
