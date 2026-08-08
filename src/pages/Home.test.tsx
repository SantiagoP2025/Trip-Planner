// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider.tsx';
import Home from './Home.tsx';

afterEach(cleanup);

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
  await user.type(screen.getByLabelText('Origen'), 'Valencia');
  await user.type(screen.getByLabelText('Destino'), 'Lisboa');
}

describe('Formulario de búsqueda', () => {
  it('pinta los campos de la sección 5', () => {
    renderHome();

    expect(screen.getByLabelText('Origen')).toBeTruthy();
    expect(screen.getByLabelText('Destino')).toBeTruthy();
    expect(screen.getByLabelText('Fecha de salida')).toBeTruthy();
    expect(screen.getByLabelText('Fecha de regreso')).toBeTruthy();
    expect(screen.getByLabelText('Adultos')).toBeTruthy();
    expect(screen.getByLabelText('Presupuesto total')).toBeTruthy();
    expect(screen.getByLabelText('Moneda')).toBeTruthy();
    expect(screen.getByLabelText('Estilo de viaje')).toBeTruthy();
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
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  // Criterio de aceptación de la sección 17.3: "El formulario envía TripRequest
  // válido". Y regla 1: envía, no genera.
  it('navega a los resultados con la búsqueda en la URL', async () => {
    const user = userEvent.setup();
    renderHome();

    await fillTrayecto(user);
    await user.click(screen.getByRole('button', { name: 'Buscar viajes' }));

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
    await user.selectOptions(screen.getByLabelText('Estilo de viaje'), 'comfort');
    await user.selectOptions(screen.getByLabelText('Moneda'), 'GBP');
    await user.click(screen.getByRole('button', { name: 'Buscar viajes' }));

    const destino = await screen.findByTestId('destino');
    expect(destino.textContent).toContain('travelStyle=comfort');
    expect(destino.textContent).toContain('currency=GBP');
  });

  it('marca la maleta facturada solo si se pide', async () => {
    const user = userEvent.setup();
    renderHome();

    await fillTrayecto(user);
    await user.click(screen.getByLabelText('Necesito maleta facturada'));
    await user.click(screen.getByRole('button', { name: 'Buscar viajes' }));

    expect((await screen.findByTestId('destino')).textContent).toContain('checkedBaggage=1');
  });

  // Regla 5: que el formulario valide lo mismo es un extra para la experiencia
  // de usuario. Aquí se comprueba que ese extra existe y se ve.
  it('no navega y avisa cuando falta el origen', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.type(screen.getByLabelText('Destino'), 'Lisboa');
    await user.click(screen.getByRole('button', { name: 'Buscar viajes' }));

    expect(screen.queryByTestId('destino')).toBeNull();
    expect(screen.getByLabelText('Origen').getAttribute('aria-invalid')).toBe('true');
  });

  it('enseña el motivo debajo del campo que falla', async () => {
    const user = userEvent.setup();
    renderHome();

    await fillTrayecto(user);
    await user.clear(screen.getByLabelText('Presupuesto total'));
    await user.type(screen.getByLabelText('Presupuesto total'), '0');
    await user.click(screen.getByRole('button', { name: 'Buscar viajes' }));

    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((alert) => alert.textContent?.includes('mayor que 0'))).toBe(true);
  });

  // Un `aria-describedby` que apunta a un identificador inexistente es peor que
  // no ponerlo: el lector de pantalla no lee nada y nadie se entera.
  it('ata el mensaje de error al campo con un identificador que existe', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.type(screen.getByLabelText('Destino'), 'Lisboa');
    await user.clear(screen.getByLabelText('Adultos'));
    await user.type(screen.getByLabelText('Adultos'), '99');
    await user.click(screen.getByRole('button', { name: 'Buscar viajes' }));

    for (const label of ['Origen', 'Adultos']) {
      const input = screen.getByLabelText(label);
      const describedBy = input.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
      expect(document.getElementById(describedBy as string)).not.toBeNull();
    }
  });

  it('resume cuántos campos hay que revisar', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('button', { name: 'Buscar viajes' }));

    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((alert) => alert.textContent?.includes('Revisa los campos'))).toBe(true);
  });
});
