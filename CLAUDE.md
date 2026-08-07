# CLAUDE.md

Guía para Claude Code en este repositorio. **Léela entera al empezar cada sesión.**

## Qué es esto

Planificador de viajes: el usuario introduce origen, destino, fechas, viajeros, presupuesto y preferencias, y el sistema devuelve tres propuestas de viaje completas (vuelo, alojamiento, itinerario día a día y desglose económico).

La especificación funcional completa está en `docs/especificacion.docx`. **Es la fuente de verdad.** Cuando una decisión no esté clara, la respuesta está ahí. Cita la sección concreta en los comentarios del código, como `// Sección 10.3:`.

En la primera versión todos los proveedores de datos son simulados. La arquitectura debe permitir sustituirlos por proveedores reales tocando un solo fichero por proveedor.

## Reglas no negociables

Estas once reglas existen porque una versión anterior de este proyecto las incumplió y acabó con fallos graves en producción. No se saltan aunque parezca que ralentizan.

### 1. Un solo camino de datos

Las propuestas se generan **en el servidor**, siempre. El frontend solo pide, recibe y pinta.

Está terminantemente prohibido escribir un generador de propuestas en el cliente, ni siquiera como paso intermedio ni "para ir viendo la pantalla mientras". Si necesitas datos para maquetar, llama al endpoint real contra los mocks del servidor.

*Por qué:* en la versión anterior se hizo primero un generador en el cliente y luego el del servidor. Nunca se borró el primero, y la pantalla de resultados siguió pintando los datos del cliente mientras todo el backend se ejecutaba y se tiraba a la basura. Nadie se dio cuenta durante meses.

### 2. Una fase no está terminada sin sus tests

La sección 17.1 de la especificación lista las pruebas unitarias obligatorias. Cada fase entrega su código **y** sus tests en el mismo commit.

No se abre la fase siguiente con tests pendientes de la anterior. Si no hay tests, la fase no está hecha, por muy bien que se vea en pantalla.

### 3. Una fase no está terminada sin sus controles de seguridad

Igual que arriba, pero con la sección 8.2. Los controles aplicables a lo que has tocado se implementan en esa misma fase, no "más adelante".

*Por qué:* la especificación anterior ya pedía rate limiting, validación del tamaño del body y topes de entrada. Se dejaron para el final y el final nunca llegó: el endpoint quedó público, sin límites y tumbable con una sola petición.

### 4. Ningún secreto lleva el prefijo `VITE_`

Todo lo que empieza por `VITE_` acaba dentro del JavaScript que descarga el navegador. Es público.

Cualquier clave de un tercero (imágenes, mapas, vuelos, alojamiento, IA) vive **solo** en el servidor, y el navegador la usa a través de una función nuestra que hace de intermediaria. Sin excepciones, ni siquiera para APIs gratuitas.

### 5. Topes duros en el esquema de entrada

Toda entrada del usuario pasa por Zod en el servidor, con límites explícitos por cada campo:

- Fecha de salida: no anterior a hoy.
- Duración: máximo 30 noches.
- Viajeros: máximo 9 adultos y 9 menores.
- Presupuesto: mayor que 0 y máximo 100.000.
- Tamaño del body: limitado.
- Texto libre (origen, destino): longitud mínima y máxima.

Que el frontend valide lo mismo es un extra para la experiencia de usuario, nunca un sustituto.

*Por qué:* sin tope de duración, una petición pidiendo un viaje de cien años genera más de 36.000 días de itinerario y tumba la función.

### 6. Nunca recalcular un agregado dentro del bucle que lo recorre

Si necesitas el mínimo, el máximo o la media de un conjunto para puntuar cada uno de sus elementos, **calcúlalos una vez antes del bucle** y pásalos como contexto.

Recorrer todas las combinaciones dentro del bucle que ya recorre todas las combinaciones convierte el algoritmo en cuadrático. Con datos simulados no se nota; con proveedores reales se cae.

### 7. Nunca `Math.min(...array)` ni `Math.max(...array)`

El spread convierte cada elemento en un argumento y Node tiene un tope. Comprobado en Node 24: a partir de unos 200.000 elementos lanza `RangeError: Maximum call stack size exceeded`.

Usa `array.reduce()` o un bucle. Aplica a cualquier función con spread sobre arrays de tamaño no acotado.

### 8. Recortar antes de combinar

Antes de hacer el producto cartesiano de vuelos por alojamientos, quédate con los mejores N de cada uno por su puntuación individual (empieza por 25 y 25).

Combinar 200 vuelos con 300 alojamientos da 60.000 combinaciones para acabar enseñando tres. Con el recorte son 625 y el resultado final es prácticamente el mismo.

### 9. La persistencia real, desde el principio

Los viajes guardados viven en Supabase, ligados a un usuario autenticado, con Row Level Security por `auth.uid()`.

`localStorage` puede servir como caché, nunca como fuente de verdad. Un viaje que desaparece al cambiar de móvil no es un viaje guardado.

### 10. Configuración de despliegue desde el commit uno

- `vercel.json` con el rewrite a `index.html` para todas las rutas **excepto** `/api/`, o cualquier ruta de React Router devolverá 404 al refrescar.
- `index.html` con `lang="es"`, `meta description` y etiquetas Open Graph.

Son quince minutos y evitan que la aplicación parezca rota antes de que nadie la pruebe.

### 11. Un commit por fase

Mensajes de commit en español, describiendo qué hace la fase. Una sesión de trabajo, una fase, un commit. Entre fases, `/clear`.

## Convenciones

- **Idioma:** todos los textos de cara al usuario, comentarios y mensajes de commit, en español. Nombres de variables, funciones y ficheros, en inglés.
- **Stack:** React 19 + TypeScript + Vite, Tailwind v4, React Router, Zod, Supabase, funciones serverless de Vercel, Vitest.
- **Aleatoriedad:** en los mocks, nunca `Math.random()` directo. PRNG con semilla derivada de las entradas, para que la misma búsqueda dé siempre el mismo resultado.
- **Errores:** al usuario, mensaje claro en español sin detalles técnicos. Al log, el detalle con un identificador de petición.
- **Comentarios:** explican el *porqué* y citan la sección de la especificación. Lo que hace el código ya lo dice el código.

## Comprobación antes de cerrar una fase

1. ¿Pasan `npm run build` y `npm test`?
2. ¿Están los tests que pide la sección 17.1 para lo que has tocado?
3. ¿Están los controles de la sección 8.2 que apliquen?
4. ¿Hay algún generador de datos en el cliente? Debe haber cero.
5. ¿Alguna clave nueva con prefijo `VITE_`? Debe haber cero.
6. ¿Algún agregado recalculado dentro de su propio bucle?
7. ¿Algún spread sobre un array de tamaño no acotado?
