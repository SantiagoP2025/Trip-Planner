// Texto para las fuentes estándar de un PDF.
//
// Un PDF con fuentes estándar (Helvetica y compañía) no lleva la fuente dentro:
// la pone el lector, y el texto se codifica en WinAnsi, que es Latin-1 con
// extras. Cubre de sobra el español —acentos, eñes, aperturas de interrogación,
// el símbolo del euro—, pero no cubre una flecha, ni un emoji, ni un ideograma.
//
// La alternativa sería incrustar una fuente Unicode completa, y son varios
// cientos de kilobytes que habría que descargar para exportar un PDF. No
// compensa: se sanea el texto y se documenta, que es lo que hace este módulo.
//
// Si un día el usuario escribe notas en un alfabeto que WinAnsi no cubre, esto
// es lo que hay que cambiar —incrustar una fuente—, y no el resto del módulo.

// Lo que los textos de la aplicación meten y WinAnsi no acepta, o acepta mal.
// Los espacios duros sí están, pero se cambian igual: dentro de un PDF no
// aportan nada y complican medir la línea. El primero lo pone
// `Intl.NumberFormat` delante del símbolo de la moneda, o sea en cada importe.
const REPLACEMENTS: Record<string, string> = {
  ' ': ' ', // espacio duro
  ' ': ' ', // espacio duro estrecho
  ' ': ' ', // espacio fino
  '→': '->', // la flecha que separa origen y destino en los títulos
  '←': '<-',
  '↔': '<->',
  '✓': '+', // marca de verificación
};

// Los huecos de CP1252 entre 0x80 y 0x9F, que no siguen a Latin-1. La raya (—)
// entra por aquí, y se usa en cada rango de fechas del documento.
const CP1252_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

function isSupported(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;

  // ASCII imprimible, y el tramo alto de Latin-1: acentos, eñes, ¿, ¡, £, ª, º.
  // El 0xa0 queda fuera a propósito: es el espacio duro, y el mapa de arriba lo
  // cambia antes de llegar aquí.
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa1 && code <= 0xff) return true;

  return CP1252_EXTRAS.has(character);
}

// Un carácter que no cabe se dice, no se borra: borrarlo dejaría una frase que
// parece completa y no lo está. Y una tirada entera de caracteres imposibles
// —una nota escrita en japonés— se marca con un solo signo, porque una pared de
// interrogantes no informa más que uno.
const UNSUPPORTED_MARK = '?';

export function sanitizePdfText(text: string): string {
  let result = '';
  let pendingUnsupported = false;

  for (const character of text) {
    const replacement = REPLACEMENTS[character];
    if (replacement !== undefined) {
      pendingUnsupported = false;
      result += replacement;
      continue;
    }

    // Los saltos de línea sobreviven: `wrapPdfText` los respeta, y una nota que
    // el usuario escribió en tres párrafos se imprime en tres párrafos.
    if (character === '\n') {
      pendingUnsupported = false;
      result += character;
      continue;
    }

    if (isSupported(character)) {
      pendingUnsupported = false;
      result += character;
      continue;
    }

    if (!pendingUnsupported) {
      result += UNSUPPORTED_MARK;
      pendingUnsupported = true;
    }
  }

  return result;
}

// Tope de longitud, con puntos suspensivos. Los textos que edita el usuario ya
// vienen acotados por el servidor (sección 8.2: "validar tamaño y contenido"),
// pero el PDF se dibuja línea a línea: un campo inesperadamente largo se
// convierte en miles de líneas y en un navegador colgado. Este es el tope de
// este lado, y no depende de que el otro siga estando.
export function truncatePdfText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

// Medidor de ancho. En producción lo pone la fuente del PDF; en los tests, una
// función cualquiera. Es lo que permite probar el reparto en líneas sin abrir
// la librería de PDF.
export type MeasureText = (text: string) => number;

// Reparte un texto en líneas que caben en `maxWidth`.
export function wrapPdfText(text: string, maxWidth: number, measure: MeasureText): string[] {
  // Un ancho no positivo no admite ninguna línea. Devolver el texto entero es
  // preferible a entrar en un bucle que nunca avanza.
  if (maxWidth <= 0) return text.length > 0 ? [text] : [];

  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/[ \t]+/).filter((word) => word.length > 0);

    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let current = '';

    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;

      if (measure(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current.length > 0) {
        lines.push(current);
        current = '';
      }

      // Una palabra sola más ancha que la línea —una dirección web larga— hay
      // que partirla por donde sea. Sin esto, `current` volvería a quedar vacío
      // en la vuelta siguiente y el bucle no avanzaría nunca.
      if (measure(word) > maxWidth) {
        let chunk = '';
        for (const character of word) {
          if (chunk.length > 0 && measure(chunk + character) > maxWidth) {
            lines.push(chunk);
            chunk = '';
          }
          chunk += character;
        }
        current = chunk;
      } else {
        current = word;
      }
    }

    if (current.length > 0) lines.push(current);
  }

  return lines;
}
