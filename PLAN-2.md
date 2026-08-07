# PLAN-2.md — de la Fase 4 en adelante

**Sustituye a `PLAN.md` a partir de la Fase 4.** Las fases 0 a 3 ya están hechas y no cambian; para ellas, `PLAN.md` sigue siendo válido como referencia histórica.

Este plan incorpora las funcionalidades que el proyecto de partida ha añadido después de la primera auditoría —mapa, edición del itinerario y exportación a PDF— y las coloca en el orden correcto, después de la base y no encima de ella.

**Cómo se usa:** una fase por sesión de Claude Code. Al empezar: `lee CLAUDE.md y PLAN-2.md y haz la Fase N`. Al terminar: comprobación de cierre, commit, push, `/clear`.

`CLAUDE.md` sigue vigente tal cual. Sus once reglas no cambian. Las cuatro de abajo se añaden a ellas.

---

## Reglas adicionales

Salen de la segunda auditoría. Aplican igual que las de `CLAUDE.md`.

### 12. Nada de coordenadas inventadas sobre un mapa real

Si no hay ubicaciones reales todavía, el mapa no lleva capa de teselas: se dibuja un esquema abstracto de las paradas, o no se dibuja nada.

*Por qué:* pintar coordenadas aleatorias sobre teselas reales enseña al usuario un pueblo húngaro cuando ha buscado Tokio. No parece provisional, parece roto.

### 13. Los arrays que alimentan un efecto se memorizan

Un array reconstruido en cada render cambia de identidad en cada render, así que el efecto que lo vigila se dispara siempre. En un mapa eso significa que se recoloca solo y el usuario no lo puede mover.

Todo array o objeto que sea dependencia de un `useEffect` va envuelto en `useMemo`, o se sustituye por una dependencia estable.

### 14. Todo lo que el usuario escriba se guarda contra el servidor

Los textos que edita el usuario no son datos generados: son suyos. No pueden vivir solo en `localStorage`, y cualquier escritura que pueda fallar lleva `try/catch` con aviso visible.

### 15. Toda operación que el usuario dispara tiene sus tres estados

Cargando, éxito y **error visible**. Un `try/finally` sin `catch` deja al usuario mirando un botón que aparentemente no hace nada.

---

## Fase 4 — Motor de generación

- Orquestador: pide ofertas a los proveedores, **recorta candidatos** (regla 8), combina, puntúa, filtra y selecciona tres propuestas diversas.
- Explicabilidad: cada propuesta dice por qué se eligió (sección 10.7 de la especificación).

Atención especial a las reglas 6 y 7 de `CLAUDE.md`: los mínimos y máximos se calculan una vez antes del bucle y se pasan como contexto, y no se usa spread sobre arrays de tamaño no acotado en ningún sitio. En el proyecto de partida este patrón está repetido en 17 sitios distintos; aquí no debe aparecer ni uno.

**Test de integración:** entrada válida → tres propuestas, distintas entre sí, todas dentro del presupuesto.

## Fase 5 — Endpoint

- `POST /api/trips/generate`: solo POST, valida, ejecuta, responde.
- Endpoint de salud.
- **Rate limiting por IP en esta misma fase.** No se pospone.
- Códigos y formato de error de la sección 16.1, con identificador de petición.

**Tests:** método no permitido → 405; body inválido → 400 con detalle; exceso de peticiones → 429.

## Fase 6 — Base de datos

- Tablas de la sección 13.1, RLS activado, políticas por `auth.uid()`.
- Clave de servicio solo en el servidor.
- Índices en todas las claves foráneas.
- Persistencia best-effort: si la base de datos falla, el viaje se genera igual.

## Fase 7 — Frontend: buscar y ver resultados

- Formulario con las mismas validaciones que el servidor.
- Pantalla de resultados que **consume la respuesta del endpoint**.
- Estados de carga y de error visibles (regla 15).

**Cierre — el más importante de todo el plan:** buscar en `src/` cualquier función que construya propuestas, vuelos, alojamientos o precios. Debe haber cero. Si aparece una "solo para ir viendo la pantalla", se borra antes de cerrar la fase. Es exactamente el fallo que arrastra el proyecto de partida desde hace meses, y es el que hace que todo lo demás que construyó encima esté apoyado en la rama equivocada.

## Fase 8 — Cuentas y viajes guardados

Va antes que la edición y el mapa a propósito: en el proyecto de partida se dejó para el final, y ahora tiene funcionalidad de edición encima de un almacenamiento que puede fallar en silencio.

- Autenticación de Supabase.
- Tabla de viajes guardados por usuario, con RLS.
- `localStorage` solo como caché, con `try/catch` en cada escritura y aviso al usuario si falla.

## Fase 9 — Itinerario día a día

- Matriz de desplazamientos vía el proveedor de rutas.
- Agrupación por proximidad, reparto entre días, horarios (sección 12).
- Validación de solapamientos y reparación.
- **Cada parada lleva coordenadas que vienen del proveedor de lugares**, no inventadas.

**Tests:** sin solapamientos; se respetan hora de llegada y de salida; se respetan los límites de la sección 12.1.

## Fase 10 — Mapa del día

Depende de la Fase 9: sin coordenadas reales, no hay mapa (regla 12).

- Mapa con las paradas del día seleccionado, numeradas y unidas por una línea.
- Encuadre automático **solo cuando cambia el día**, no en cada render (regla 13).
- Si el día no tiene paradas, no se renderiza el mapa.
- Elegir proveedor de teselas: revisar la política de uso del que se elija y anotar su coste por usuario, que entra en el modelo de precios.

**Tests:** cambiar de día reencuadra; interactuar con el mapa no lo reencuadra; día sin paradas no rompe nada.

## Fase 11 — Edición del itinerario

Depende de la Fase 8: no se permite editar nada hasta que haya dónde guardarlo de verdad.

- El usuario puede reescribir los textos de cada bloque del día y los datos del restaurante.
- Se distingue visualmente lo editado de lo original, y se puede volver al original.
- Las ediciones se guardan contra el servidor (regla 14).
- Guardado con estado visible: guardando, guardado, error.

**Tests:** editar y volver al original; una edición vacía o idéntica al original no cuenta como edición; un fallo al guardar avisa al usuario.

## Fase 12 — Exportar a PDF

- La librería de PDF se carga con `import()` dinámico, solo al pulsar el botón. Nunca en el bundle principal.
- Las imágenes se recomprimen antes de incrustarse, con tope de tamaño de origen y con salida sin foto si falla.
- El `URL.createObjectURL` se revoca **con retraso**, no en la misma vuelta de eventos que el clic, porque Safari cancela la descarga.
- `catch` con mensaje visible si la generación falla (regla 15).

## Fase 13 — Acabado

- Accesibilidad: navegación por teclado, foco visible, contraste.
- Rendimiento: tamaño del bundle, imágenes.
- Metaetiquetas y Open Graph definitivos.
- Revisión de textos.
- Despliegue en Vercel y comprobación de que refrescar en una ruta interna no da 404.

---

## Al terminar

Estarás donde está hoy el proyecto de partida —mapa, edición y PDF incluidos— pero con tests, con el endpoint protegido, sin el generador duplicado, sin el scoring cuadrático, con cuentas de usuario, con coordenadas reales y sin el 404 al refrescar.

De ahí en adelante ya no es plan, es producto: sustituir los proveedores simulados por reales, y ver qué cuentas salen.
