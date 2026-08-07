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
| `SUPABASE_ANON_KEY` | Clave anónima de Supabase (cliente). |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio de Supabase. Solo servidor. |
| `AMADEUS_CLIENT_ID` | Credencial del proveedor de vuelos. Solo servidor. |
| `AMADEUS_CLIENT_SECRET` | Credencial del proveedor de vuelos. Solo servidor. |
| `ANTHROPIC_API_KEY` | Clave de la API de Anthropic Claude. Solo servidor. |
| `GOOGLE_MAPS_API_KEY` | Clave de Google Places/Routes. Solo servidor. |

Ninguna de estas variables debe llevar el prefijo `VITE_`: ese prefijo hace que Vite la incluya en el JavaScript que se descarga en el navegador, exponiéndola públicamente. El navegador accede a estos proveedores siempre a través de las funciones del servidor en `api/`.

## Despliegue

Desplegado en Vercel. `vercel.json` reescribe cualquier ruta que no empiece por `/api/` a `index.html`, para que React Router funcione al refrescar la página en una ruta como `/results`.
