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

## Despliegue

Desplegado en Vercel. `vercel.json` reescribe cualquier ruta que no empiece por `/api/` a `index.html`, para que React Router funcione al refrescar la página en una ruta como `/results`.
