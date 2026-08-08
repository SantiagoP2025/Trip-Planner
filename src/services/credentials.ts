// Validación del formulario de acceso. Regla 5 de CLAUDE.md: esto es un extra
// para la experiencia de usuario, nunca un sustituto. Quien decide de verdad si
// un correo y una contraseña valen es Supabase, y sus errores se enseñan tal
// como llegan traducidos desde `auth-gateway.ts`.
//
// Sirve para no gastar una ida y vuelta —y una petición del tope de Supabase—
// en un formulario a medio rellenar.

export const MIN_PASSWORD_LENGTH = 8;
// Supabase corta las contraseñas a 72 bytes, que es el tope de bcrypt. Decirlo
// aquí evita que alguien crea que su contraseña larguísima cuenta entera.
export const MAX_PASSWORD_LENGTH = 72;
export const MAX_EMAIL_LENGTH = 254;

// Deliberadamente laxa: comprobar que hay algo, una arroba y un punto detrás. La
// expresión "correcta" para direcciones de correo no existe, y cada intento de
// afinarla acaba rechazando direcciones válidas de alguien.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CredentialErrors = Record<string, string>;

export interface Credentials {
  email: string;
  password: string;
}

export function validateCredentials({ email, password }: Credentials): CredentialErrors {
  const errors: CredentialErrors = {};

  const trimmed = email.trim();
  if (trimmed.length === 0) {
    errors.email = 'Escribe tu correo electrónico.';
  } else if (trimmed.length > MAX_EMAIL_LENGTH) {
    errors.email = `El correo no puede superar los ${MAX_EMAIL_LENGTH} caracteres.`;
  } else if (!EMAIL_PATTERN.test(trimmed)) {
    errors.email = 'Este correo no parece válido.';
  }

  if (password.length === 0) {
    errors.password = 'Escribe tu contraseña.';
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    errors.password = `La contraseña no puede superar los ${MAX_PASSWORD_LENGTH} caracteres.`;
  }

  return errors;
}
