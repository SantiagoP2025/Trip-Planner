# Auditoría 2 — Trip Planner de Vicente

**Repo:** `github.com/VICENTE102/trip-planner`
**Despliegue:** `trip-planner-plum-nine.vercel.app`
**Fecha:** agosto 2026
**Sustituye a:** `AUDITORIA-TRIP-PLANNER.md` (primera auditoría). Este documento la incluye entera.

## Qué ha cambiado desde la primera auditoría

Siete ficheros nuevos, diez modificados, tres dependencias añadidas: `leaflet`, `react-leaflet` y `@react-pdf/renderer`.

Lo nuevo:

- Vista "Día a día" con un **mapa** (`DayMap.tsx`, `DayByDayView.tsx`, `DayCard.tsx`, `utils/geo.ts`).
- **Exportación a PDF** de la propuesta (`components/pdf/`).
- **Edición del itinerario**: el usuario puede reescribir los textos de mañana, tarde y noche, y los datos del restaurante (`utils/itineraryEdits.ts`).

**Lo que NO ha cambiado:** ni un solo fallo de la primera auditoría se ha corregido. `server/`, `api/` y `supabase/` están intactos. Todo lo que sigue en la sección A sigue abierto exactamente igual que hace unos días.

---

# A. Fallos de la primera auditoría — TODOS SIGUEN ABIERTOS

Verificado uno a uno sobre el código actual.

### A.1 🔴 El backend genera las propuestas y la pantalla de resultados las tira

Confirmado, sin cambios. `SearchScreen.tsx` sigue guardando la respuesta del API en `sessionStorage`, y `ResultsScreen.tsx` sigue llamando a `buildSearchResult()` de `searchService.ts` y reconstruyéndolo todo con los mocks del cliente.

Ahora es peor que antes: la vista "Día a día", el mapa y el PDF cuelgan todos de esa propuesta reconstruida en el cliente. Es decir, **todo lo nuevo que ha añadido se ha construido encima de la rama equivocada.** Cuando se conecte el backend de verdad, esos tres componentes habrá que rehacerlos o readaptarlos.

### A.2 🔴 `/api/trips/generate` sigue público, sin autenticación ni límite de peticiones

Sin cambios. Ni rate limiting, ni clave, ni captcha.

### A.3 🔴 Sigue sin tope de duración del viaje ni fecha futura

El esquema valida presupuesto, viajeros, longitud de texto y preferencias, pero de fechas solo comprueba que el regreso sea posterior a la salida. Un viaje de cien años sigue siendo una petición válida.

### A.4 🔴 El scoring cuadrático — y es bastante peor de lo que reporté

En la primera auditoría lo situé en `combine-offers.ts`. Al revisar el resto de algoritmos, el patrón está repetido por todas partes:

- `combine-offers.ts`: 5 usos de spread sobre arrays no acotados.
- `score-accommodation.ts`: 7 usos.
- `score-flight.ts`: 5 usos.

Son 17 sitios donde se hace `Math.min(...array)` / `Math.max(...array)` sobre conjuntos de tamaño no acotado, la mayoría dentro de funciones que se llaman una vez por combinación. Con mocks no se nota. Con proveedores reales, primero se arrastra y después lanza `RangeError: Maximum call stack size exceeded` (comprobado en Node 24: pasa con 100.000 elementos, falla con 200.000).

### A.5 🔴 Refrescar en cualquier ruta interna da 404

Sigue sin `vercel.json`. Confirmado en el despliegue.

### A.6 🟠 `<html lang="en">` con la aplicación entera en español

Sin cambios.

### A.7 🟠 Sin `meta description` ni Open Graph

Sin cambios. Compartir el enlace sigue dando vista previa vacía.

### A.8 🟠 La clave de Pexels sigue en el bundle público

`VITE_PEXELS_API_KEY` sigue expuesta a cualquiera que abra las herramientas de desarrollo.

### A.9 🟠 `writeAll()` de `tripStorage` sigue sin `try/catch`

Y esto ahora es más grave, ver B.4.

### A.10 🟠 Los viajes siguen solo en `localStorage`

Y esto también empeora con la edición, ver B.4.

### A.11 🟠 Cero tests

Sin cambios. `package.json` sigue sin framework de tests ni script, con más código que antes.

### A.12 🟡 README sigue siendo la plantilla de Vite

---

# B. Fallos nuevos

## Mapa

### B.1 🔴 El mapa enseña un sitio real que no tiene nada que ver con el destino

`utils/geo.ts`:

```ts
export function fakeCityCenter(destination: string): FakeCoordinates {
  const random = createSeededRandom(hashString(`center-${destination}`));
  return {
    lat: 36 + random() * 20,
    lng: -9 + random() * 35,
  };
}
```

Las coordenadas son un número pseudoaleatorio dentro de un rectángulo que cubre Europa. Y encima se pintan sobre teselas reales de OpenStreetMap.

El resultado: buscas Tokio y el mapa te enseña con todo detalle un pueblo de Hungría, con sus calles y sus nombres reales, y cuatro chinchetas numeradas encima. No parece un marcador de posición, parece que la aplicación está rota o miente.

El comentario del código deja claro que es provisional y que se sustituirá al conectar Google Places, y como decisión de desarrollo es razonable. El problema es que **está desplegado en producción y accesible a cualquiera**.

**Qué hacer, por orden de preferencia:** conectar coordenadas reales; o, mientras tanto, quitar la capa de teselas y dibujar un esquema abstracto de las paradas sin mapa real debajo; o como mínimo, un aviso visible de que las ubicaciones son de ejemplo.

### B.2 🟠 El mapa se recoloca solo y no deja moverlo

`DayMap.tsx`:

```ts
const positions: [number, number][] = stops.map((stop) => [stop.lat, stop.lng]);
```

Ese array se reconstruye en cada render, así que su identidad cambia siempre. Y es dependencia del efecto de `FitBoundsToStops`:

```ts
useEffect(() => { ... map.fitBounds(positions, ...) }, [map, positions]);
```

Resultado: el efecto se dispara en **cada render**, no solo cuando cambian las paradas. En cuanto el usuario mueve o hace zoom en el mapa, cualquier re-render lo devuelve a su sitio. Da la sensación de que el mapa está pegado y no se deja tocar.

**Qué hacer:** memorizar `positions` con `useMemo`, o pasar como dependencia algo estable como el identificador del día.

### B.3 🟠 El mapa revienta si un día se queda sin paradas

`center={positions[0]}` con `stops` vacío pasa `undefined` como centro, y `fitBounds([])` lanza excepción.

Hoy no es alcanzable porque `itineraryBuilder` genera siempre exactamente cuatro paradas por día. Pero como ya se puede editar el itinerario, en cuanto se permita borrar una parada el fallo aparece.

**Qué hacer:** si `stops.length === 0`, no renderizar el mapa.

### B.4 🟠 Usar directamente las teselas de OpenStreetMap en producción

```
url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
```

Ese servidor de teselas lo mantiene la fundación OpenStreetMap con donaciones, y su política de uso restringe bastante el uso en aplicaciones desplegadas, más aún si van a monetizarse. La atribución está bien puesta, que es lo primero que suele faltar, pero la atribución no es lo único que exige la política.

**Qué hacer:** revisar la política de uso vigente y, si se va a lanzar, mover las teselas a un proveedor pensado para producción con su plan correspondiente. Y meter ese coste en el modelo de precios, porque es otro coste por usuario que hoy no está contado.

## Edición del itinerario

### B.5 🔴 Las ediciones del usuario se pueden perder sin previo aviso

Ahora el usuario escribe contenido propio: reescribe los planes de cada día y los datos del restaurante. Eso ya no son datos generados y desechables, es trabajo suyo. Y va todo a `localStorage` a través del mismo `writeAll()` que sigue sin `try/catch` (A.9).

Los viajes guardados han crecido: ahora llevan además las paradas con coordenadas y las ediciones. Se llega antes al límite de los 5 MB. Y cuando se llegue, guardar lanzará una excepción no capturada y el usuario perderá lo que acababa de escribir sin ver ningún mensaje.

Sumado a A.10 (todo vive solo en el navegador), las ediciones también desaparecen al cambiar de dispositivo o limpiar datos.

**Qué hacer:** `try/catch` con aviso al usuario, y subir la persistencia real con cuentas de usuario en cuanto se pueda. Esta funcionalidad es, por sí sola, razón suficiente para no seguir aplazando A.10.

### B.6 🟢 La lógica de edición en sí está bien

`itineraryEdits.ts` es de lo mejor del repositorio: inmutable, sin efectos secundarios, limpia las ediciones vacías, distingue entre "editado" y "vuelto al original". Nada que objetar. Solo le faltan tests.

## PDF

### B.7 🟢 Bien planteado

Conviene decirlo: `@react-pdf/renderer` se carga con `import()` dinámico solo cuando el usuario pulsa descargar, así que no pesa en el bundle principal. `downscaleImage.ts` comprueba el tamaño antes de descargar, recomprime, y si algo falla devuelve `null` y el PDF sale sin portada en vez de romperse. Es la parte mejor pensada de todo lo nuevo.

### B.8 🟠 En Safari la descarga puede no llegar a producirse

```ts
link.click();
URL.revokeObjectURL(url);
```

La URL se revoca en la misma vuelta de eventos que el clic. Safari, que es donde probablemente lo estéis probando, a veces cancela la descarga por esto.

**Qué hacer:** revocar dentro de un `setTimeout` de un segundo, o usar el evento de descarga.

### B.9 🟠 Si la generación del PDF falla, el usuario no se entera

El bloque es `try { ... } finally { setIsGeneratingPdf(false); }`, sin `catch`. Si `toBlob()` lanza —una fuente que no carga, datos inesperados—, el indicador de carga desaparece y no pasa absolutamente nada más. El usuario pulsa, espera, y concluye que el botón no funciona.

**Qué hacer:** `catch` con un mensaje de error visible.

---

## Resumen

| | Primera auditoría | Ahora |
|---|---|---|
| Fallos críticos abiertos | 5 | 8 |
| Fallos medios abiertos | 5 | 11 |
| Tests | 0 | 0 |
| Fallos corregidos | — | 0 |

El código nuevo, tomado por separado, está mejor escrito que el que había. La edición del itinerario y la carga diferida del PDF están bien resueltas. El problema no es la calidad de lo que escribe, es que se está construyendo encima de una base con ocho fallos críticos sin tocar, y cada funcionalidad nueva se apoya en la rama equivocada del punto A.1 y hace más caro arreglarlo.
