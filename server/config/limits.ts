// Regla 5 de CLAUDE.md: tope duro de tamaño del body. Un TripRequest válido
// pesa unos pocos KB; 20 KB deja margen sin permitir bodies arbitrariamente grandes.
export const MAX_REQUEST_BODY_BYTES = 20 * 1024;

export function isWithinBodySizeLimit(rawBody: string | Uint8Array): boolean {
  const size =
    typeof rawBody === 'string' ? Buffer.byteLength(rawBody, 'utf8') : rawBody.byteLength;
  return size <= MAX_REQUEST_BODY_BYTES;
}
