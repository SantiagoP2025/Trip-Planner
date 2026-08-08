// Sección 16.3: "Añadir un requestId a cada generación". Se genera siempre en
// el servidor y nunca se toma de una cabecera del cliente: un identificador que
// elige quien llama permite ensuciar o falsear los logs de otro.
export function createRequestId(): string {
  return crypto.randomUUID();
}

// En Vercel la plataforma escribe `x-real-ip` y la primera entrada de
// `x-forwarded-for` con la IP real del cliente, sobrescribiendo lo que llegara
// de fuera. Fuera de Vercel, detrás de un proxy que no las sobrescriba, estas
// cabeceras son falsificables; por eso el limitador es una barrera contra el
// abuso accidental y las ráfagas, no un control de identidad (sección 8.2:
// "Añadir autenticación antes de permitir acceso a viajes privados").
export function resolveClientIp(request: Request): string {
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  // Sin IP identificable todas las peticiones comparten cubo. Es deliberado:
  // preferimos limitar de más a dejar un hueco sin límite.
  return 'unknown';
}
