import { describe, expect, it } from 'vitest';
import { sanitizePdfText, truncatePdfText, wrapPdfText } from './pdf-text.ts';

// Un medidor de mentira: cada carácter mide uno. Es lo que permite probar el
// reparto en líneas sin abrir la librería de PDF ni medir una fuente de verdad.
const measure = (text: string) => text.length;

describe('sanitizePdfText', () => {
  // Lo importante: el español entero pasa tal cual. Si esto fallara, el PDF
  // saldría lleno de interrogantes en una aplicación que está toda en español.
  it('conserva acentos, eñes, aperturas y el símbolo del euro', () => {
    const texto = '¿Cuántos días en A Coruña? Presupuesto: 1.234 € — «el mejor»';

    expect(sanitizePdfText(texto)).toBe(texto);
  });

  it('cambia el espacio duro que Intl mete en cada importe', () => {
    const importe = new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(1234);

    expect(importe).toContain(' ');
    expect(sanitizePdfText(importe)).not.toContain(' ');
    expect(sanitizePdfText(importe)).toContain('€');
  });

  it('traduce la flecha de los títulos', () => {
    expect(sanitizePdfText('Valencia → Lisboa')).toBe('Valencia -> Lisboa');
  });

  // Borrar el carácter dejaría una frase que parece completa y no lo está.
  it('marca lo que la fuente no puede escribir', () => {
    expect(sanitizePdfText('Cena 🍣 en el puerto')).toBe('Cena ? en el puerto');
  });

  // Una pared de interrogantes no informa más que uno solo.
  it('junta una tirada entera de caracteres imposibles en una sola marca', () => {
    expect(sanitizePdfText('Hotel 東京タワー centro')).toBe('Hotel ? centro');
  });

  it('respeta los saltos de línea de lo que escribe el usuario', () => {
    expect(sanitizePdfText('Primera\nSegunda')).toBe('Primera\nSegunda');
  });

  it('no se atraganta con un texto vacío', () => {
    expect(sanitizePdfText('')).toBe('');
  });
});

describe('truncatePdfText', () => {
  it('deja en paz lo que ya cabe', () => {
    expect(truncatePdfText('Museo', 10)).toBe('Museo');
  });

  it('corta lo que no cabe y lo dice', () => {
    const corto = truncatePdfText('Museo Nacional de Arte Antiga', 10);

    expect(corto).toHaveLength(10);
    expect(corto.endsWith('…')).toBe(true);
  });
});

describe('wrapPdfText', () => {
  it('reparte el texto sin pasarse del ancho', () => {
    const lineas = wrapPdfText('uno dos tres cuatro cinco', 10, measure);

    for (const linea of lineas) {
      expect(linea.length).toBeLessThanOrEqual(10);
    }
    expect(lineas.join(' ')).toBe('uno dos tres cuatro cinco');
  });

  it('no parte lo que cabe entero', () => {
    expect(wrapPdfText('uno dos', 20, measure)).toEqual(['uno dos']);
  });

  // Sin esto el bucle no avanzaría nunca: la palabra no cabe, la línea se cierra
  // vacía y en la vuelta siguiente vuelve a no caber.
  it('parte una palabra más larga que la línea', () => {
    const lineas = wrapPdfText('https://ejemplo.example/una-ruta-larguisima', 10, measure);

    expect(lineas.length).toBeGreaterThan(1);
    for (const linea of lineas) {
      expect(linea.length).toBeLessThanOrEqual(10);
    }
    expect(lineas.join('')).toBe('https://ejemplo.example/una-ruta-larguisima');
  });

  it('respeta los párrafos que escribió el usuario', () => {
    expect(wrapPdfText('uno\ndos', 20, measure)).toEqual(['uno', 'dos']);
  });

  it('devuelve el texto entero si el ancho no admite ninguna línea', () => {
    expect(wrapPdfText('uno', 0, measure)).toEqual(['uno']);
    expect(wrapPdfText('', 0, measure)).toEqual([]);
  });

  it('no devuelve líneas para un texto vacío', () => {
    expect(wrapPdfText('', 100, measure)).toEqual(['']);
  });
});
