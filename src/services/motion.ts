// Fase 14, regla 19: las animaciones respetan `prefers-reduced-motion`.
//
// El CSS ya apaga las seis, pero hay una que además retrasa algo: al enviar el
// formulario se esperan 450 ms para que dé tiempo a ver despegar el avión. Con
// la animación apagada esa espera son 450 ms mirando un botón quieto, así que
// hay que consultarlo también desde JavaScript.
//
// `matchMedia` no existe en jsdom, donde corren los tests de componentes.
// Llamarlo sin comprobar tira el render entero, que es un fallo bastante peor
// que el de más.
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
