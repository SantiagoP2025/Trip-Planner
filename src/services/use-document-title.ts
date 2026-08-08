import { useEffect } from 'react';

// El título de la pestaña, por pantalla.
//
// En una aplicación de una sola página el título no cambia solo: sin esto, las
// cuatro pantallas se llaman igual. Importa más de lo que parece. Es lo que
// distingue una pestaña de otra cuando hay quince abiertas, es lo que se guarda
// en el marcador, y es lo primero que anuncia un lector de pantalla al cambiar
// de pantalla: sin actualizarlo, quien navega a ciegas no recibe ninguna señal
// de que la navegación ha ocurrido.

export const SITE_NAME = 'Trip Planner';

// El de la portada, y el mismo que trae `index.html` para que no parpadee al
// arrancar.
export const HOME_TITLE = `${SITE_NAME} — Planificador de viajes automático`;

export function buildDocumentTitle(pageTitle?: string): string {
  return pageTitle ? `${pageTitle} — ${SITE_NAME}` : HOME_TITLE;
}

export function useDocumentTitle(pageTitle?: string): void {
  useEffect(() => {
    document.title = buildDocumentTitle(pageTitle);
  }, [pageTitle]);
}
