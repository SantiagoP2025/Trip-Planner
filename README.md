# Trip Planner

Planificador de viajes: el usuario introduce origen, destino, fechas, viajeros, presupuesto y preferencias, y el sistema devuelve tres propuestas de viaje completas (vuelo, alojamiento, itinerario día a día y desglose económico).

Las propuestas se generan siempre en el servidor. El frontend solo pide, recibe y pinta resultados; nunca genera datos por su cuenta. En esta primera versión todos los proveedores de datos (vuelos, alojamiento, lugares, rutas) son simulados, detrás de interfaces que permitirán sustituirlos por proveedores reales sin tocar el motor.

La especificación funcional completa está en [`docs/especificacion.docx`](docs/especificacion.docx). El plan de fases está en [`PLAN.md`](PLAN.md) y las reglas de desarrollo en [`CLAUDE.md`](CLAUDE.md).

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

## Despliegue

Desplegado en Vercel. `vercel.json` reescribe cualquier ruta que no empiece por `/api/` a `index.html`, para que React Router funcione al refrescar la página en una ruta como `/results`.
