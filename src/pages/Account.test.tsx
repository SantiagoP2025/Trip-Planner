// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider.tsx';
import type { AuthGateway } from '../auth/auth-gateway.ts';
import { createFakeAuthGateway, TEST_SESSION } from '../auth/test-fixtures.ts';
import Account from './Account.tsx';

afterEach(() => {
  cleanup();
});

function renderAccount(createGateway: () => Promise<AuthGateway | null>) {
  return render(
    <AuthProvider createGateway={createGateway}>
      <MemoryRouter initialEntries={['/cuenta']}>
        <Routes>
          <Route path="/cuenta" element={<Account />} />
          <Route path="/viajes" element={<p>Mis viajes</p>} />
          <Route path="/" element={<p>Formulario</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

async function fillCredentials(email = 'alguien@ejemplo.test', password = 'contraseña-larga') {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Correo electrónico'), email);
  await user.type(screen.getByLabelText('Contraseña'), password);
  return user;
}

describe('Pantalla de cuenta', () => {
  it('entra con el correo y la contraseña', async () => {
    const fake = createFakeAuthGateway({ session: null });
    renderAccount(async () => fake.gateway);

    const user = await fillCredentials();
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(fake.calls.signIn).toBe(1);
  });

  // Regla 15, y el caso más doloroso de todos: el usuario escribe su
  // contraseña, pulsa, y no pasa nada.
  it('enseña el error cuando las credenciales no son correctas', async () => {
    const fake = createFakeAuthGateway({
      session: null,
      signIn: () => Promise.reject(new Error('El correo o la contraseña no son correctos.')),
    });
    renderAccount(async () => fake.gateway);

    const user = await fillCredentials();
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('El correo o la contraseña no son correctos.')).toBeTruthy();
  });

  // Regla 5: el formulario valida lo mismo antes de gastar una petición, pero
  // quien manda es el servidor.
  it('no llama al servidor con el formulario a medias', async () => {
    const fake = createFakeAuthGateway({ session: null });
    renderAccount(async () => fake.gateway);

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Correo electrónico'), 'no-es-un-correo');
    await user.type(screen.getByLabelText('Contraseña'), 'corta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(fake.calls.signIn).toBe(0);
    expect(screen.getByText('Este correo no parece válido.')).toBeTruthy();
    expect(screen.getByText(/al menos 8 caracteres/i)).toBeTruthy();
  });

  it('deja crear una cuenta y avisa si hay que confirmar el correo', async () => {
    const fake = createFakeAuthGateway({
      session: null,
      signUp: async () => ({ needsConfirmation: true }),
    });
    renderAccount(async () => fake.gateway);

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Créala aquí' }));

    await user.type(screen.getByLabelText('Correo electrónico'), 'alguien@ejemplo.test');
    await user.type(screen.getByLabelText('Contraseña'), 'contraseña-larga');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByText(/confirmar la cuenta/)).toBeTruthy();
    expect(fake.calls.signUp).toBe(1);
  });

  it('lleva a los viajes guardados en cuanto hay sesión', async () => {
    const fake = createFakeAuthGateway({ session: null });
    renderAccount(async () => fake.gateway);

    await screen.findByRole('button', { name: 'Entrar' });
    await act(async () => fake.emit(TEST_SESSION));

    expect(await screen.findByText('Mis viajes')).toBeTruthy();
  });

  // Sin Supabase configurado no se enseña un formulario que no puede funcionar.
  it('dice que las cuentas no están disponibles cuando no hay Supabase', async () => {
    renderAccount(async () => null);

    expect(await screen.findByText('Las cuentas no están disponibles')).toBeTruthy();
    expect(screen.queryByLabelText('Contraseña')).toBeNull();
  });
});
