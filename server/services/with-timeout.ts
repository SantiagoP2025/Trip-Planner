// Un servicio externo que no responde es tan dañino como uno que falla: sin
// tope, el usuario se queda esperando indefinidamente por algo que nadie va a
// contestar. Lo usan la persistencia (fase 6) y la comprobación de sesión
// (fase 8), que hablan las dos con Supabase.
export async function withinTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    // `Promise.race` ya ha enganchado un manejador a `work`, así que si tarda y
    // acaba fallando no queda una promesa rechazada sin atender.
    clearTimeout(timer);
  }
}
