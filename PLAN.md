# PLAN.md — de cero a paridad

Objetivo de este plan: llegar al mismo punto funcional que el prototipo de partida, pero sin ninguno de los fallos que salieron en su auditoría.

**Cómo se usa:** una fase por sesión de Claude Code. Al empezar cada sesión: `lee CLAUDE.md y PLAN.md y haz la Fase N`. Al terminar: comprobación de cierre, commit, `/clear`. Nunca dos fases seguidas en la misma sesión.

**Antes de la Fase 0:** copia `docs/especificacion.docx` al repositorio. Sin ella, este plan no se puede ejecutar.

---

## Fase 0 — Andamiaje y barreras

Antes de una sola línea de lógica.

- Proyecto Vite + React 19 + TypeScript. Tailwind v4. React Router. Zod. Vitest.
- `vercel.json` con el rewrite a `index.html` excluyendo `/api/`.
- `index.html`: `lang="es"`, título real, `meta description`, Open Graph con imagen 1200×630.
- `README.md` de verdad: qué es, cómo se arranca, qué variables de entorno hace falta. No la plantilla de Vite.
- `.env.example` con los nombres de las variables y ningún valor.
- Estructura de carpetas: `src/` (cliente), `server/` (lógica), `api/` (funciones de Vercel), `supabase/`.
- Un test trivial que pase, solo para dejar montada la tubería.

**Cierre:** `npm run build` y `npm test` pasan. Desplegado en Vercel, y refrescar en una ruta inventada lleva a la aplicación, no a un 404.

## Fase 1 — Contratos y validación

Es la fase más aburrida y la que más problemas evita.

- Tipos internos de vuelo, alojamiento, actividad, itinerario, propuesta y presupuesto (secciones 11 y 12 de la especificación).
- Esquema Zod de la solicitud, con **todos** los topes de la regla 5 de `CLAUDE.md`.
- Límite de tamaño del body.
- Mensajes de error en español.

**Tests obligatorios:** fecha pasada rechazada; duración por encima del máximo rechazada; regreso anterior a salida rechazado; presupuesto negativo, cero y por encima del máximo rechazados; preferencia fuera de 0-3 rechazada; solicitud válida aceptada.

## Fase 2 — Proveedores simulados detrás de una interfaz

- Una interfaz por proveedor: vuelos, alojamiento, lugares, rutas (sección 14.1).
- Implementación simulada de cada una, con PRNG con semilla.
- Los datos simulados salen por la interfaz **con la misma forma** que saldrán los reales.

Esta es la fase que decide si dentro de seis meses conectar una API real es un día de trabajo o un mes.

**Tests:** la misma entrada da siempre la misma salida; cada mock respeta el contrato de su interfaz.

## Fase 3 — Algoritmos puros

Todo función pura: entra un dato, sale otro, sin estado ni efectos.

- Reparto de presupuesto (sección 9).
- Normalización de puntuaciones (10.3).
- Afinidad de preferencias (6.2).
- Puntuación de vuelo (11.2) y de alojamiento (11.4).
- Restricciones duras y umbrales mínimos (10.1 y 10.4).
- Frontera de Pareto (10.5).
- Diversidad entre propuestas (10.6).

Aquí se aplican las reglas 6, 7 y 8 de `CLAUDE.md`. Los agregados (mínimos, máximos) se calculan una vez y se pasan como parámetro; ninguna función recorre el conjunto completo desde dentro de un bucle sobre ese mismo conjunto.

**Tests:** los nueve casos de la sección 17.1. Es la fase con más tests de todo el plan, y son los más baratos de escribir porque no hay estado que montar.

## Fase 4 — Motor de generación

- Orquestador que pide ofertas a los proveedores, recorta candidatos (regla 8), combina, puntúa, filtra y selecciona tres propuestas diversas.
- Explicabilidad: cada propuesta dice por qué se eligió (10.7).

**Test de integración:** entrada válida → tres propuestas, distintas entre sí, todas dentro del presupuesto.

## Fase 5 — Endpoint

- `POST /api/trips/generate`: solo POST, valida, ejecuta, responde.
- Endpoint de salud (7.1).
- **Rate limiting por IP desde esta misma fase.** No es opcional y no se pospone.
- Códigos HTTP y formato de error de la sección 16.1, con identificador de petición.

**Tests:** método no permitido devuelve 405; body inválido devuelve 400 con el detalle; superar el límite de peticiones devuelve 429.

## Fase 6 — Base de datos

- Tablas de la sección 13.1.
- RLS activado, políticas por `auth.uid()` para lo que lee el usuario.
- La clave de servicio solo en el servidor, nunca con prefijo `VITE_`.
- Índices en todas las claves foráneas.
- Persistencia best-effort: si la base de datos falla, el viaje se genera igual.

**Test de integración:** generar un viaje lo guarda; recuperarlo por identificador devuelve lo guardado.

## Fase 7 — Frontend: buscar y ver resultados

- Formulario de búsqueda con las mismas validaciones que el servidor.
- Pantalla de resultados que **consume la respuesta del endpoint**. Cero generación en el cliente (regla 1).
- Estados de carga y de error visibles.
- Cada `input` con su `label`, cada imagen con su `alt`.

**Cierre:** buscar `searchService` o similar en `src/` no debe encontrar ningún generador de datos.

## Fase 8 — Cuentas y viajes guardados

- Autenticación de Supabase.
- Guardar y recuperar viajes ligados al usuario.
- `localStorage` solo como caché, con `try/catch` alrededor de cada escritura.

## Fase 9 — Itinerario día a día

- Matriz de desplazamientos vía el proveedor de rutas.
- Agrupación por proximidad, reparto entre días, horario (sección 12).
- Validación de solapamientos y reparación.

**Tests:** sin solapamientos; se respetan hora de llegada y de salida; se respetan los límites de la sección 12.1.

## Fase 10 — Acabado

- Accesibilidad: navegación por teclado, foco visible, contraste.
- Rendimiento: tamaño del bundle, imágenes.
- Metaetiquetas y Open Graph definitivos.
- Revisión de textos.

---

## Al terminar

Llegado aquí estás donde estaba el prototipo de partida, pero con tests, sin el endpoint abierto, sin el generador duplicado, sin el scoring cuadrático, con cuentas de usuario y sin el 404 al refrescar.

Lo siguiente ya no es este plan: es sustituir los proveedores simulados por reales, y eso depende de a qué APIs consigas acceso y de qué cuentas salgan. Es una decisión de producto, no de código.
