import { describe, expect, it } from 'vitest';
import {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validateCredentials,
} from './credentials.ts';

const VALID = { email: 'alguien@ejemplo.test', password: 'contraseña-larga' };

describe('validateCredentials', () => {
  it('no encuentra nada que objetar a unas credenciales válidas', () => {
    expect(validateCredentials(VALID)).toEqual({});
  });

  it('pide el correo cuando está vacío', () => {
    expect(validateCredentials({ ...VALID, email: '   ' }).email).toBeDefined();
  });

  it('rechaza un correo sin arroba o sin dominio', () => {
    expect(validateCredentials({ ...VALID, email: 'alguien' }).email).toBeDefined();
    expect(validateCredentials({ ...VALID, email: 'alguien@ejemplo' }).email).toBeDefined();
  });

  it('acepta un correo con espacios alrededor', () => {
    expect(validateCredentials({ ...VALID, email: '  alguien@ejemplo.test ' }).email).toBeUndefined();
  });

  // Regla 5 de CLAUDE.md: todo texto libre lleva tope.
  it('rechaza un correo por encima del tope', () => {
    const email = `${'a'.repeat(MAX_EMAIL_LENGTH)}@ejemplo.test`;

    expect(validateCredentials({ ...VALID, email }).email).toBeDefined();
  });

  it('exige la longitud mínima de contraseña', () => {
    const password = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);

    expect(validateCredentials({ ...VALID, password }).password).toBeDefined();
    expect(validateCredentials({ ...VALID, password: `${password}a` }).password).toBeUndefined();
  });

  // Supabase corta a 72 bytes, que es el tope de bcrypt: decirlo evita que
  // alguien crea que su contraseña larguísima cuenta entera.
  it('rechaza una contraseña por encima del tope de bcrypt', () => {
    const password = 'a'.repeat(MAX_PASSWORD_LENGTH + 1);

    expect(validateCredentials({ ...VALID, password }).password).toBeDefined();
  });

  it('no recorta la contraseña: los espacios cuentan', () => {
    expect(validateCredentials({ ...VALID, password: '        ' })).toEqual({});
  });

  it('devuelve los dos errores a la vez', () => {
    expect(validateCredentials({ email: '', password: '' })).toEqual({
      email: expect.any(String),
      password: expect.any(String),
    });
  });
});
