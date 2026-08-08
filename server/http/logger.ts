import type { TripGenerationDiagnostics } from '../types/trip.js';

// Sección 16.3 y sección 8.2 ("Registrar errores sin almacenar datos personales
// innecesarios"): al log va lo que sirve para diagnosticar —identificador,
// ruta, estado, duración y contadores del motor— y nada más. Ni origen, ni
// destino, ni fechas, ni presupuesto, ni la IP: son datos del usuario y no
// hacen falta para saber qué ha pasado.
//
// Tampoco se registra ningún secreto: aquí no entra nada que venga de la
// configuración del servidor.

export interface RequestLogFields {
  requestId: string;
  route: string;
  method: string;
  status: number;
  durationMs: number;
  outcome?: string;
}

export function logRequest(fields: RequestLogFields): void {
  console.log(JSON.stringify({ level: 'info', ...fields }));
}

// Sección 16.3: "Registrar duración de cada proveedor", "Registrar número de
// ofertas", "Registrar descartes y causas".
export function logGenerationDiagnostics(
  requestId: string,
  diagnostics: TripGenerationDiagnostics,
): void {
  console.log(JSON.stringify({ level: 'info', requestId, event: 'trip.generated', ...diagnostics }));
}

// El detalle técnico vive solo aquí, atado al identificador que sí ha visto el
// usuario. `cause` se recorre porque los errores de proveedor lo usan para
// guardar el fallo original.
export function logError(requestId: string, event: string, error: unknown): void {
  console.error(
    JSON.stringify({
      level: 'error',
      requestId,
      event,
      error: describeError(error),
    }),
  );
}

// El tope de profundidad no es decorativo: una cadena de `cause` circular
// dejaría la función dando vueltas y tumbaría la petición desde el propio log.
const MAX_CAUSE_DEPTH = 3;

function describeError(error: unknown, depth = 0): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const described: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  if (error.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    described.cause = describeError(error.cause, depth + 1);
  }

  return described;
}
