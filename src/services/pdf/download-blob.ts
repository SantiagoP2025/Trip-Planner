// Disparar la descarga de un fichero que hemos construido en el navegador.
//
// El retraso al revocar la URL es el fallo B.8 de la auditoría, y es la parte
// menos evidente de todo el asunto: `URL.revokeObjectURL()` en la misma vuelta
// de eventos que el clic deja a Safari sin nada que descargar a la mitad, y el
// usuario ve un botón que a veces funciona y a veces no. Se revoca con retraso.
//
// Revocarla en algún momento no es opcional: mientras la URL viva, el navegador
// mantiene el fichero entero en memoria.

export const OBJECT_URL_REVOKE_DELAY_MS = 1_000;

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';

  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_DELAY_MS);
}
