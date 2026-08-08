# Trip Planner

Planificador de viajes: el usuario introduce origen, destino, fechas, viajeros, presupuesto y preferencias, y el sistema devuelve tres propuestas de viaje completas (vuelo, alojamiento, itinerario día a día y desglose económico).

Las propuestas se generan siempre en el servidor. El frontend solo pide, recibe y pinta resultados; nunca genera datos por su cuenta. En esta primera versión todos los proveedores de datos (vuelos, alojamiento, lugares, rutas) son simulados, detrás de interfaces que permitirán sustituirlos por proveedores reales sin tocar el motor.

La especificación funcional completa está en [`docs/especificacion.docx`](docs/especificacion.docx). El plan de fases está en [`PLAN-2.md`](PLAN-2.md) —[`PLAN.md`](PLAN.md) sigue valiendo como referencia de las fases 0 a 3— y las reglas de desarrollo en [`CLAUDE.md`](CLAUDE.md).

## Cómo se arranca

```bash
npm install
npm run dev      # servidor de desarrollo de Vite
npm run build    # compilación de producción (tsc -b && vite build)
npm test         # pruebas con Vitest
```

## Estructura

```
api/         funciones serverless de Vercel (rutas HTTP públicas)
server/      lógica de backend: esquemas, servicios, proveedores, algoritmos, repositorios, mocks
src/         frontend React (componentes, páginas, servicios de cliente)
supabase/    esquema y migraciones de base de datos
docs/        especificación funcional
```

## Variables de entorno

Copia `.env.example` a `.env.local` y rellena lo que necesites para el entorno en el que trabajes.

| Variable | Uso |
| --- | --- |
| `SUPABASE_URL` | URL del proyecto de Supabase. |
| `SUPABASE_ANON_KEY` | Clave anónima de Supabase. Sin ella no hay cuentas de usuario. La usa el navegador, que la recibe de `GET /api/config` en tiempo de ejecución. |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio de Supabase. Solo servidor. |
| `AMADEUS_CLIENT_ID` | Credencial del proveedor de vuelos. Solo servidor. |
| `AMADEUS_CLIENT_SECRET` | Credencial del proveedor de vuelos. Solo servidor. |
| `ANTHROPIC_API_KEY` | Clave de la API de Anthropic Claude. Solo servidor. |
| `GOOGLE_MAPS_API_KEY` | Clave de Google Places/Routes. Solo servidor. |

Ninguna de estas variables debe llevar el prefijo `VITE_`: ese prefijo hace que Vite la incluya en el JavaScript que se descarga en el navegador, exponiéndola públicamente. El navegador accede a estos proveedores siempre a través de las funciones del servidor en `api/`.

La clave anónima de Supabase es la única que llega al navegador, y llega servida por `GET /api/config`, no horneada en el bundle: no es un secreto —lo que decide qué puede tocar cada usuario son las políticas Row Level Security— y así el mismo compilado sirve para Development, Preview y Production con valores distintos.

## Cuentas y viajes guardados

Los viajes guardados viven en Supabase, ligados a un usuario autenticado y con Row Level Security por `auth.uid()`. `localStorage` guarda una copia local para que la lista aparezca al instante, pero nunca decide nada: la respuesta del servidor manda siempre.

Sin `SUPABASE_URL` ni `SUPABASE_ANON_KEY`, la aplicación sigue generando viajes; lo que hace la interfaz es decir que las cuentas no están disponibles.

Las migraciones de `supabase/migrations/` se aplican con `supabase db push`, o pegándolas en el editor SQL del proyecto.

## Mapas

**Hoy no se cargan teselas de ningún proveedor, y es deliberado.** Las coordenadas que devuelve el proveedor de lugares son simuladas: son coordenadas posibles, pero no son las del destino que ha buscado el usuario. Dibujarlas sobre un mapa real enseñaría un pueblo cualquiera, con sus calles y sus nombres, a quien ha buscado Tokio. No parecería provisional: parecería que la aplicación miente.

Mientras tanto, `DayMap` dibuja un esquema de las paradas del día: posiciones relativas verdaderas —quién está cerca de quién, en qué dirección y en qué orden— sobre un fondo que no pretende ser ningún sitio, y con un pie que lo dice.

### Cuando haya coordenadas reales

Al conectar el proveedor de lugares real, el esquema se sustituye por un mapa con teselas. Lo que hay que tener decidido para entonces:

**No usar directamente `tile.openstreetmap.org`.** Ese servidor lo mantiene la fundación OpenStreetMap con donaciones y su política de uso restringe las aplicaciones desplegadas, más aún si se monetizan. La atribución es necesaria pero no suficiente.

Candidatos, por orden de preferencia:

| Proveedor | Modelo | Por qué |
| --- | --- | --- |
| **Protomaps** (PMTiles) | Fichero propio servido desde nuestro CDN | Sin coste por carga ni por usuario: se paga el almacenamiento y el tráfico, que ya pagamos. Es el único que no añade un coste que crece con el uso. |
| **MapTiler** | Plan gratuito con tope mensual, después por volumen | Alternativa gestionada si no queremos mantener el fichero de teselas. |
| **Mapbox** | Plan gratuito con tope mensual, después por millar de cargas | El más completo, y el más caro cuando el tope se queda corto. |

**Coste por usuario.** Con los tres primeros, salvo Protomaps, el coste es *por carga de mapa*, no por usuario registrado: un usuario que abre tres propuestas y cambia de día cinco veces puede generar decenas de cargas. Ese multiplicador es lo que hay que medir antes de elegir, y por eso Protomaps encabeza la lista.

Las cifras concretas de cada plan cambian a menudo: **hay que confirmarlas en el momento de contratar**, no darlas por buenas desde aquí. Lo que no cambia es la forma del coste, que es lo que entra en el modelo de precios.

## Exportar a PDF

Cada propuesta se puede descargar en PDF, desde la pantalla de resultados y desde la de viajes guardados. El documento lleva el resumen del viaje, el vuelo, el alojamiento, el desglose del gasto y el itinerario día a día con el esquema de las paradas de cada día. Si el viaje está guardado, lleva además las ediciones del usuario, marcadas como suyas.

**La librería de PDF no está en el bundle principal.** Entra por `import()` dinámico dentro de `services/pdf/render-trip-pdf.ts`, y el navegador solo la descarga cuando alguien pulsa el botón. Son unos 600 kB que, con una importación normal, pagaría cada visita a la portada para no usarlos casi nunca. `services/pdf/dynamic-import.test.ts` comprueba en cada `npm test` que sigue siendo así, porque es un requisito fácil de romper sin que se note nada.

El módulo está partido en tres, y la partición es lo que lo hace probable:

| Fichero | Qué hace |
| --- | --- |
| `trip-document.ts` | Convierte la propuesta en una lista de bloques. No sabe nada de PDF, así que el contenido del documento se prueba entero sin abrir uno. |
| `render-trip-pdf.ts` | Dibuja esos bloques. Es el único fichero que toca la librería. |
| `download-blob.ts` | Dispara la descarga en el navegador. |

**Sin fotos, y no es un descuido.** No hay proveedor de imágenes: la versión anterior traía fotos de portada con la clave del proveedor metida en el bundle público, que es justo lo que prohíbe la regla 4. Lo único que se dibuja es el esquema del mapa, que es vectorial. El día que haya fotos, se recomprimen antes de incrustarlas y el PDF sale sin foto si la recompresión falla; el sitio para eso es `render-trip-pdf.ts`.

**Texto.** El PDF usa las fuentes estándar, que no van dentro del fichero y codifican en WinAnsi. Cubre el español entero —acentos, eñes, aperturas, el euro— pero no una flecha ni un emoji, y `drawText` lanza con lo que no cubre. Por eso todo el texto pasa por `sanitizePdfText()`: lo que no cabe se marca, no se borra en silencio. La alternativa sería incrustar una fuente Unicode completa, que son varios cientos de kilobytes más por descarga.

## Diseño

El sistema de diseño entero vive en `src/index.css`: los tokens de color, las dos familias tipográficas y las seis animaciones. Nada de eso se repite en los componentes.

**Color.** Coral (`sunset`) para la marca y los acentos, turquesa (`lagoon`) para las acciones, y un tono tierra (`ink`) en lugar de los grises neutros. Lo último es lo que le quita el aspecto de plantilla: el gris de fábrica es lo que comparten todas.

**Tipografía.** Fraunces para títulos, etiquetas y el botón principal; Inter para el cuerpo.

**El color de cada nivel de propuesta** está en `src/constants/proposalTheme.ts` y en ningún otro sitio, para que la tarjeta y las pestañas del itinerario de dentro no acaben de dos colores distintos.

**Los iconos son once rutas SVG** en `src/components/Icon.tsx`, sin librería: el paquete más pequeño que los trae añade decenas de kilobytes para usar el diez por ciento.

**Las animaciones se apagan con `prefers-reduced-motion`**, las seis, y `project-config.test.ts` lo comprueba una a una. El fallo típico no es olvidar el bloque: es añadir la séptima animación y no meterla dentro.

### Fotografías del mosaico

El fondo de la pantalla de búsqueda son diez fotografías de Wikimedia Commons, fijas, sin proveedor ni clave de nadie. La mayoría están bajo licencias que **exigen citar autor y licencia**, así que la atribución viaja en `src/constants/collagePhotos.ts`, junto a cada URL, y el pie de la pantalla la pinta desde esa misma lista: si se cambia una foto, cambia su crédito.

| Foto | Autor | Licencia |
| --- | --- | --- |
| Cataratas del Iguazú | Mariordo (Mario Roberto Durán Ortiz) | CC BY-SA 4.0 |
| Hutongs de Pekín | Autor desconocido | Dominio público |
| Rocinha, Río de Janeiro | Diego Baravelli | CC BY-SA 4.0 |
| Angkor Wat | Fuzheado | CC BY-SA 2.0 |
| El Cervino desde la Domhütte | chil / Zacharie Grossen | CC BY-SA 3.0 |
| Capadocia, Turquía | Antonio Cristofaro | CC BY 3.0 |
| Bora Bora desde la Estación Espacial | NASA Johnson Space Center | Dominio público |
| Dunas de Merzouga | Bjørn Christian Tørrissen | CC BY-SA 3.0 |
| Gran Cañón desde Pima Point | Chensiyuan | CC BY-SA 4.0 |
| Aurora boreal en Alaska | Joshua Strang (US Air Force) | Dominio público |

## Accesibilidad

**El foco visible lo pone una sola regla**, en `src/index.css`, y ningún componente repite utilidades de foco. Antes cada botón llevaba `focus:outline-none focus:ring-2`, con dos problemas: se olvida —el botón número dieciocho se queda sin indicador y no lo nota quien lo escribe, porque navega con el ratón— y `ring` es un `box-shadow`, que el modo de alto contraste de Windows descarta. Un `outline` sobrevive. `src/accessibility.test.ts` comprueba que nadie vuelve a apagarlo.

**Contraste.** Los botones macizos usan `sky-700` y no `sky-600`: con texto blanco encima, `sky-600` se queda en 4,1 y el mínimo para texto normal es 4,5. Lo mismo en las chinchetas del mapa y del PDF, que llevan el número de la parada en blanco.

**Contraste sobre las fotos.** La pantalla de búsqueda va sobre un mosaico, y ahí el caso peor no es la foto media: es un píxel blanco —la nieve del Cervino, la espuma del Iguazú— justo debajo de una letra. Medido contra ese píxel, tres cosas no llegaban al 4,5 y se corrigieron: la capa oscura subió del 72 % al 80 %, el subrayado de los campos pasó de blanco al 30 % (1,06, y es la única señal de que ahí hay un campo) al 70 %, y los textos de apoyo de las pantallas claras dejaron `ink-500` (3,90) por `ink-700` (7,93). `src/accessibility.test.ts` comprueba las dos últimas.

**Las pestañas de los días llevan el patrón entero**: panel asociado, `aria-controls`, un solo tabulador para entrar en el grupo y flechas, Inicio y Fin para moverse dentro. Antes tenían los roles pero no el comportamiento, y eso es peor que no tenerlos: el rol anuncia "pestaña 2 de 8" y promete unas flechas que no estaban.

**El título de la pestaña cambia con la pantalla** (`useDocumentTitle`). En una aplicación de una sola página no cambia solo, y es la señal que recibe un lector de pantalla al navegar.

## Rendimiento

El bundle principal son ~353 kB (108 kB comprimido) y es casi todo React, React Router y Zod. Las dos librerías pesadas del proyecto no están ahí:

| Fragmento | Tamaño | Cuándo se descarga |
| --- | --- | --- |
| `index-*.js` | 353 kB | Siempre. React, Router, Zod y la aplicación. |
| `supabase-*.js` | 208 kB | Solo si el despliegue tiene cuentas configuradas. |
| `pdf-*.js` | 425 kB | Solo al pulsar "Descargar en PDF". |

Los nombres de los fragmentos se fijan en `vite.config.ts`. Por defecto salían `dist-*.js` y `es-*.js`, que vienen del fichero de entrada de cada paquete y no dicen nada: con nombre, una regresión de tamaño tiene dueño en cuanto se mira la salida de `npm run build`.

Desde la fase 14 sí hay fuentes web —Fraunces e Inter, desde Google Fonts, con `display=swap` para que el texto se lea mientras llegan— y diez fotografías en la pantalla de búsqueda, todas con `loading="lazy"` y con un color de reserva si alguna falla. El resto de lo ilustrado sigue siendo SVG: el esquema del mapa y los once iconos.

## Despliegue

Desplegado en Vercel. `vercel.json` reescribe cualquier ruta que no empiece por `/api/` a `index.html`, para que React Router funcione al refrescar la página en una ruta como `/results`. `project-config.test.ts` comprueba ese patrón ruta por ruta, porque es un fallo que no rompe nada hasta que alguien refresca —fue el fallo A.5 de la auditoría y estuvo meses en producción— y porque ningún test de componente lo ve.

```bash
npm run build          # tiene que pasar antes de subir nada
npx vercel --prod      # o el despliegue automático desde la rama principal
```

Variables de entorno a definir en el proyecto de Vercel, **separadas por entorno** (Development, Preview y Production, sección 8.2): las de la tabla de arriba. Ninguna con prefijo `VITE_`.

Después de desplegar, tres comprobaciones que no se pueden hacer desde local:

1. `GET /api/health` responde correctamente (criterio de la sección 17.3).
2. Abrir `/viajes` y **refrescar**: tiene que seguir en `/viajes` y no dar 404.
3. Pegar la URL en cualquier sitio que genere vista previa y comprobar que salen el título, la descripción y la imagen.

Cuando el dominio esté fijado, añadir `og:url` a `index.html` con la URL absoluta. Se ha dejado fuera a propósito: una `og:url` que no es la del despliegue manda a otro sitio a quien comparte el enlace, y eso es peor que no tenerla.
