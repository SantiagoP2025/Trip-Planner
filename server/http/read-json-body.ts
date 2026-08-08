import { isWithinBodySizeLimit, MAX_REQUEST_BODY_BYTES } from '../config/limits.ts';

export type JsonBodyFailure = 'UNSUPPORTED_MEDIA_TYPE' | 'BODY_TOO_LARGE' | 'MALFORMED_JSON';

export type JsonBodyResult = { ok: true; value: unknown } | { ok: false; reason: JsonBodyFailure };

// Sección 8.2: "Validar tamaño y contenido del body".
//
// El tamaño se mira dos veces a propósito. Primero en `Content-Length`, para no
// llegar a leer un cuerpo enorme; después sobre lo leído de verdad, porque la
// cabecera la escribe quien llama y puede mentir o faltar.
export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return { ok: false, reason: 'UNSUPPORTED_MEDIA_TYPE' };
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    return { ok: false, reason: 'BODY_TOO_LARGE' };
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, reason: 'MALFORMED_JSON' };
  }

  if (!isWithinBodySizeLimit(raw)) {
    return { ok: false, reason: 'BODY_TOO_LARGE' };
  }

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, reason: 'MALFORMED_JSON' };
  }
}

// CLAUDE.md: mensaje claro en español y sin detalles técnicos. El motivo exacto
// sí distingue entre los tres fallos, porque los tres se arreglan de forma
// distinta desde el lado del cliente.
export function messageForJsonBodyFailure(reason: JsonBodyFailure): string {
  switch (reason) {
    case 'UNSUPPORTED_MEDIA_TYPE':
      return 'La solicitud debe enviarse en formato JSON.';
    case 'BODY_TOO_LARGE':
      return 'La solicitud es demasiado grande.';
    case 'MALFORMED_JSON':
      return 'La solicitud no tiene el formato esperado.';
  }
}
