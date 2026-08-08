import { describe, expect, it } from 'vitest';
import { buildProposal, SUMMARY } from './test-fixtures.ts';
import { buildTripPdfDocument, type PdfBlock } from './trip-document.ts';

const GENERADO = new Date('2026-08-08T09:00:00.000Z');

function build(options: Parameters<typeof buildTripPdfDocument>[0]) {
  return buildTripPdfDocument({ generatedAt: GENERADO, ...options });
}

// Todo el texto del documento en una sola cadena, para poder preguntar si algo
// aparece sin depender de en qué bloque cayó.
function allText(blocks: PdfBlock[]): string {
  return blocks
    .map((block) => {
      if (block.kind === 'row') return `${block.label} ${block.value}`;
      if (block.kind === 'item') return `${block.time} ${block.text} ${block.badge ?? ''}`;
      if (block.kind === 'map') return block.caption;
      if (block.kind === 'pageBreak') return '';
      return block.text;
    })
    .join('\n');
}

describe('buildTripPdfDocument', () => {
  it('titula el documento con el origen y el destino', () => {
    const { title, blocks } = build({ summary: SUMMARY, proposal: buildProposal() });

    // Con raya y no con la flecha de la pantalla: la fuente estándar de un PDF
    // no tiene flecha, y el sustituto de la flecha en cuerpo veinte queda a
    // medio camino entre un titular y una línea de consola.
    expect(title).toBe('Valencia – Lisboa');
    expect(blocks[0]).toEqual({ kind: 'title', text: 'Valencia – Lisboa' });
  });

  // Los viajes guardados sí llevan la flecha en el título, porque lo compuso el
  // servidor. Ahí no queda otra que sustituirla.
  it('sustituye la flecha de un título que ya venía escrito', () => {
    const { title } = build({
      summary: { ...SUMMARY, title: 'Valencia → Lisboa' },
      proposal: buildProposal(),
    });

    expect(title).toBe('Valencia -> Lisboa');
  });

  it('prefiere el título que puso el usuario al guardar el viaje', () => {
    const { title } = build({
      summary: { ...SUMMARY, title: 'Puente de septiembre' },
      proposal: buildProposal(),
    });

    expect(title).toBe('Puente de septiembre');
  });

  it('lleva el precio, la puntuación y las razones de la propuesta', () => {
    const texto = allText(build({ summary: SUMMARY, proposal: buildProposal() }).blocks);

    expect(texto).toContain('La recomendada');
    expect(texto).toContain('2386 €');
    expect(texto).toContain('Puntuación 82 sobre 100');
    expect(texto).toContain('La mejor relación entre precio y puntuación.');
    expect(texto).toContain('El vuelo de vuelta sale a última hora.');
  });

  // Sección 9: el desglose impreso tiene que cuadrar. Que falte una partida es
  // invisible en pantalla y descarado en papel, donde el usuario suma.
  it('el desglose incluye las siete partidas y suma el total', () => {
    const proposal = buildProposal();
    const { blocks } = build({ summary: SUMMARY, proposal });

    const partidas = blocks.filter(
      (block): block is Extract<PdfBlock, { kind: 'row' }> => block.kind === 'row',
    );
    const etiquetas = partidas.map((fila) => fila.label);

    expect(etiquetas).toContain('Seguro de viaje');
    expect(etiquetas).toContain('Total');

    const { budget } = proposal;
    const suma =
      budget.mainTransportCost +
      budget.accommodationCost +
      budget.foodBudget +
      budget.activityCost +
      budget.localTransportCost +
      budget.insuranceCost +
      budget.emergencyReserve;

    expect(suma).toBeCloseTo(budget.totalTripCost, 2);
  });

  it('imprime el día a día con sus horas', () => {
    const texto = allText(build({ summary: SUMMARY, proposal: buildProposal() }).blocks);

    expect(texto).toContain('Día a día');
    expect(texto).toContain('Día 1 — 10 de septiembre de 2026');
    expect(texto).toContain('Visita: Mirador de Santa Luzia');
    expect(texto).toContain('19:00–20:30');
  });

  it('empieza el día a día en una página nueva', () => {
    const { blocks } = build({ summary: SUMMARY, proposal: buildProposal() });
    const corte = blocks.findIndex((block) => block.kind === 'pageBreak');

    expect(corte).toBeGreaterThan(0);
    expect(blocks[corte + 1]).toEqual({ kind: 'title', text: 'Día a día' });
  });

  // Fase 11: lo que el usuario ha reescrito es suyo, y en el PDF va su texto.
  it('imprime la edición del usuario y la distingue del original', () => {
    const { blocks } = build({
      summary: SUMMARY,
      proposal: buildProposal(),
      edits: [
        {
          itemId: 'dia2-museo',
          title: 'Museo, con la entrada ya comprada',
          description: 'Reservada para las diez.',
          updatedAt: '2026-08-08T08:00:00.000Z',
        },
      ],
    });

    const texto = allText(blocks);
    expect(texto).toContain('Museo, con la entrada ya comprada');
    expect(texto).toContain('Reservada para las diez.');
    expect(texto).toContain('Editado por ti');
    expect(texto).not.toContain('Visita: Museo Nacional de Arte Antiga');

    // Los bloques que el usuario no ha tocado no se marcan.
    const marcados = blocks.filter(
      (block) => block.kind === 'item' && block.badge !== undefined,
    );
    expect(marcados).toHaveLength(1);
  });

  it('dibuja el mapa de los días que tienen paradas con coordenadas', () => {
    const { blocks } = build({ summary: SUMMARY, proposal: buildProposal() });
    const mapas = blocks.filter(
      (block): block is Extract<PdfBlock, { kind: 'map' }> => block.kind === 'map',
    );

    // Dos días, los dos con paradas: dos mapas. Las comidas no traen
    // coordenadas y no salen.
    expect(mapas).toHaveLength(2);
    expect(mapas[0]?.stops).toHaveLength(1);
    expect(mapas[1]?.stops).toHaveLength(2);
  });

  // Regla 12 de PLAN-2.md: el fondo no es un mapa real, y en papel hay que
  // decirlo igual que en pantalla.
  it('el mapa dice que no es una ubicación sobre un mapa real', () => {
    const { blocks } = build({ summary: SUMMARY, proposal: buildProposal() });
    const mapa = blocks.find(
      (block): block is Extract<PdfBlock, { kind: 'map' }> => block.kind === 'map',
    );

    expect(mapa?.caption).toContain('no su ubicación sobre un mapa real');
  });

  it('no dibuja mapa en un día sin paradas con coordenadas', () => {
    const { blocks } = build({
      summary: SUMMARY,
      proposal: buildProposal({
        itinerary: [
          {
            date: '2026-09-10',
            items: [
              {
                id: 'solo-comida',
                startTime: '2026-09-10T21:00:00.000Z',
                endTime: '2026-09-10T22:00:00.000Z',
                type: 'meal',
                title: 'Cena',
                durationMinutes: 60,
                verificationStatus: 'unverified',
              },
            ],
          },
        ],
      }),
    });

    expect(blocks.filter((block) => block.kind === 'map')).toHaveLength(0);
  });

  it('dice que un día está libre en vez de dejarlo en blanco', () => {
    const texto = allText(
      build({
        summary: SUMMARY,
        proposal: buildProposal({ itinerary: [{ date: '2026-09-10', items: [] }] }),
      }).blocks,
    );

    expect(texto).toContain('Día libre, sin nada programado.');
  });

  it('no abre la sección del día a día si la propuesta no trae itinerario', () => {
    const { blocks } = build({
      summary: SUMMARY,
      proposal: buildProposal({ itinerary: [] }),
    });

    expect(blocks.filter((block) => block.kind === 'pageBreak')).toHaveLength(0);
    expect(allText(blocks)).not.toContain('Día a día');
  });

  // Sección 12.1: "marcar datos no verificados". En papel es donde más se
  // parece a una promesa.
  it('marca lo estimado y avisa de que hay que confirmarlo', () => {
    const texto = allText(build({ summary: SUMMARY, proposal: buildProposal() }).blocks);

    expect(texto).toContain('Horario estimado sobre la llegada del vuelo.');
    expect(texto).toContain('confírmalos con cada proveedor');
    expect(texto).toContain('8 de agosto de 2026');
  });

  describe('nombre del fichero', () => {
    it('sale del viaje, sin acentos ni espacios', () => {
      const { fileName } = build({
        summary: { ...SUMMARY, origin: 'A Coruña', destination: 'São Paulo' },
        proposal: buildProposal(),
      });

      expect(fileName).toBe('viaje-a-coruna-sao-paulo-2026-09-10.pdf');
    });

    // El origen y el destino son texto libre del usuario, y esto acaba en el
    // atributo `download` de un enlace (sección 8.2: validar el contenido).
    it('no deja pasar barras, puntos ni comillas del texto del usuario', () => {
      const { fileName } = build({
        summary: { ...SUMMARY, origin: '../../etc/passwd', destination: 'a"b<c>' },
        proposal: buildProposal(),
      });

      expect(fileName).toMatch(/^[a-z0-9-]+\.pdf$/);
      expect(fileName).not.toContain('..');
    });

    it('sigue siendo un nombre válido si el destino no deja ni una letra', () => {
      const { fileName } = build({
        summary: { ...SUMMARY, origin: '???', destination: '!!!' },
        proposal: buildProposal(),
      });

      expect(fileName).toBe('viaje-2026-09-10.pdf');
    });
  });

  describe('topes de tamaño (sección 8.2)', () => {
    it('corta un texto desmesurado en vez de dibujar mil líneas', () => {
      const { blocks } = build({
        summary: SUMMARY,
        proposal: buildProposal({ reasons: ['a'.repeat(5000)] }),
      });

      for (const block of blocks) {
        if (block.kind === 'bullet') expect(block.text.length).toBeLessThanOrEqual(500);
      }
    });

    it('no imprime más días de los previstos aunque lleguen más', () => {
      const muchosDias = Array.from({ length: 200 }, (_, index) => ({
        date: `2026-09-${String((index % 28) + 1).padStart(2, '0')}`,
        items: [],
      }));

      const { blocks } = build({
        summary: SUMMARY,
        proposal: buildProposal({ itinerary: muchosDias }),
      });

      const dias = blocks.filter(
        (block) => block.kind === 'heading' && block.text.startsWith('Día '),
      );
      expect(dias.length).toBeLessThanOrEqual(40);
    });
  });

  // Lo que escribe el usuario pasa por la misma fuente que el resto: si no se
  // saneara, `drawText` lanzaría y la descarga fallaría entera por un emoji.
  it('sanea lo que el usuario haya escrito', () => {
    const texto = allText(
      build({
        summary: SUMMARY,
        proposal: buildProposal(),
        edits: [
          {
            itemId: 'dia2-museo',
            title: 'Museo 🎨 imprescindible',
            updatedAt: '2026-08-08T08:00:00.000Z',
          },
        ],
      }).blocks,
    );

    expect(texto).toContain('Museo ? imprescindible');
  });
});
