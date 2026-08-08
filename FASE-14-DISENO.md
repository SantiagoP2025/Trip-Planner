# FASE 14 — Diseño visual

**Objetivo:** que la aplicación se vea igual que la referencia (`github.com/VICENTE102/trip-planner`), sobre el motor, los tests y la seguridad que ya tienes. Nada de lo construido en las fases 0 a 13 se toca.

**Por qué hace falta esta fase:** el plan anterior cubría motor, algoritmos, endpoint, base de datos, cuentas, tests, seguridad y despliegue. La especificación de la que partía es un documento de backend y no define aspecto. La Fase 13 se llamaba "Acabado" pero era accesibilidad, rendimiento y metaetiquetas. Nunca hubo dirección visual. Esta fase la añade.

Todo lo que sigue está sacado del código de la referencia. No hay que inventar nada: hay que reproducirlo.

---

## Reglas de esta fase

Las once de `CLAUDE.md` y las cuatro de `PLAN-2.md` siguen vigentes. Además:

### 16. Solo se toca la capa de presentación

`server/`, `api/`, `supabase/` y los esquemas de validación no se modifican. Si un cambio visual pide tocar el motor, es que el cambio está mal planteado.

### 17. Los 796 tests siguen en verde

Si un test se rompe, se arregla el componente, no el test. Un test que estorba a un cambio visual está señalando que el cambio ha alterado comportamiento, no aspecto.

### 18. No se regresa en accesibilidad

La Fase 13 dejó foco visible con una sola regla, contraste corregido y las pestañas con su patrón completo. El diseño nuevo es sobre fondo oscuro con fotos debajo: hay que **volver a comprobar el contraste de cada texto**, no darlo por hecho. Texto blanco al 60% sobre una foto no cumple aunque encima haya una capa oscura.

### 19. Cada animación respeta `prefers-reduced-motion`

La referencia tiene seis animaciones. Todas deben desactivarse si el sistema lo pide.

---

## Sistema de diseño

### Tipografía

Dos familias desde Google Fonts, importadas al principio de `src/index.css`:

```css
@import url("https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,500;0,600;0,700;1,500&family=Inter:wght@400;500;600;700&display=swap");
```

- **Fraunces** (serif) para títulos, etiquetas de formulario y botón principal.
- **Inter** (sans) para todo el cuerpo.

### Color

Tokens de Tailwind v4, en el bloque `@theme` de `src/index.css`:

```css
@theme {
  --color-sunset-50:  #fff8f0;
  --color-sunset-100: #ffe8de;
  --color-sunset-200: #ffd1be;
  --color-sunset-400: #ff9a78;
  --color-sunset-500: #ff7e5f;
  --color-sunset-600: #f2603d;
  --color-sunset-700: #d1471f;

  --color-lagoon-50:  #ecfdfa;
  --color-lagoon-100: #cff7f1;
  --color-lagoon-400: #2dd4c4;
  --color-lagoon-500: #14b8a6;
  --color-lagoon-600: #0f9488;
  --color-lagoon-700: #0c766d;

  --color-ink-900: #3f2e29;
  --color-ink-700: #5c4a42;
  --color-ink-500: #8a7a72;
  --color-ink-200: #e8dcd3;

  --font-heading: "Fraunces", "system-ui", serif;
  --font-body:    "Inter", "system-ui", sans-serif;
}
```

`body` va con fondo `sunset-50` y texto `ink-900`. `h1, h2, h3` usan `--font-heading`.

**Coral (`sunset`) para la marca y los acentos. Turquesa (`lagoon`) para las acciones.** El tono tierra (`ink`) sustituye a los grises neutros en todo el interfaz: es lo que le quita el aspecto de plantilla.

### Color por nivel de propuesta

Un fichero de constantes con el tema de cada nivel, para que ninguna pantalla invente su propio tono:

- **Económico** → emerald (`text-emerald-700`, `bg-emerald-50`, `bg-emerald-500`, `border-emerald-500`, `bg-emerald-100 text-emerald-700`)
- **Equilibrado** → indigo, con la misma estructura
- **Cómodo** → amber, con la misma estructura

Cada nivel necesita: `label`, `text`, `softBg`, `solidBg`, `border`, `badge`, `tabActive`, `accentText`.

---

## Pantalla de búsqueda

Es donde está casi toda la diferencia. Estructura:

```
┌──────────────────────────────────────────┐
│  ✈ TripPlanner        Buscar  Mis viajes │  ← nav flotante, transparente
├──────────────────────────────────────────┤
│ ▓▓▓ mosaico de 10 fotos, 5 col × 2 filas │
│ ▓▓▓ + capa oscura al 72%                 │
│ ▓▓▓ + degradado vertical                 │
│                                          │
│         ☀ BIENVENIDO A TRIPPLANNER       │  ← eyebrow, coral claro
│           ¿A dónde vamos?                │  ← Fraunces, 4xl / 6xl
│   El mundo entero está esperando.        │
│                                          │
│   [formulario en blanco sobre la foto]   │
└──────────────────────────────────────────┘
```

### Mosaico de fondo

Componente `WorldCollage`: un `grid grid-cols-5 grid-rows-2` en posición absoluta, con diez fotografías reales de lugares del mundo. Cada tesela es un `<img>` con `object-cover`, `loading="lazy"`, `alt=""` (es decorativa) y un `onError` que la sustituye por un bloque de color si falla.

Las diez URLs están en `src/constants/collagePhotos.ts` de la referencia — cógelas de ahí tal cual. Son ficheros de Wikimedia Commons, no hacen falta API ni claves. **Añade la atribución** en el pie o en el README: son imágenes libres, pero la mayoría exige citar autor y licencia.

Encima del mosaico van dos capas: `bg-ink-900/72` y un degradado vertical `from-ink-900/50 via-transparent to-ink-900/70`.

### Barra de navegación

Marca a la izquierda: icono de avión + "TripPlanner" en Fraunces. Enlaces a la derecha: "Buscar" (brújula) y "Mis viajes" (maleta), cada uno con su icono.

Tiene **dos modos**. Sobre la pantalla de resultados, donde la foto llena la parte de arriba, flota transparente (`absolute inset-x-0 top-0`) con texto blanco. En el resto, es una barra fija con fondo `sunset-50/95` y desenfoque.

### Formulario

Sobre el fondo oscuro, así que **todo el texto del formulario es blanco**.

Los campos no son cajas: son líneas. `border-0 border-b-2 border-white/30 bg-transparent`, sin relleno lateral, texto grande, y al enfocarse el borde inferior pasa a `sunset-400`.

Las etiquetas son preguntas en Fraunces, no sustantivos:

| En vez de | Pon |
|---|---|
| Origen | ¿Desde dónde sales? |
| Destino | ¿A dónde te apetece ir? |
| Fecha de salida | ¿Cuándo os vais? |
| Fecha de regreso | ¿Cuándo volvéis? |
| Presupuesto total | ¿Cuál es tu presupuesto total? |
| Adultos | ¿Cuántos adultos viajáis? |
| Menores | ¿Cuántos menores? (opcional) |
| Estilo de viaje | ¿Qué tipo de viaje buscas? |
| Preferencias | ¿Qué te apetece hacer? |

Los campos aparecen escalonados con `animate-fade-in-up` y retardos de 0, 60, 120, 180, 240, 300, 330, 360, 420 y 480 ms.

Los inputs de fecha llevan `[color-scheme:dark]` para que el selector nativo no salga blanco.

Hay un detalle de la referencia que merece copiarse: los campos numéricos guardan el texto crudo en un estado aparte del número. Si enlazas el input directamente al número, `Number("")` devuelve 0 y se te pega un cero delante mientras escribes.

### Botón de envío

Píldora a ancho completo, degradado `from-lagoon-500 to-indigo-600`, texto en Fraunces, sombra `shadow-indigo-900/30`, y al pasar por encima sube medio píxel.

Dentro lleva un avión que se desplaza a la derecha al pasar el ratón, y tres puntos de estela que aparecen detrás. Al enviar, el avión despega (`animate-plane-takeoff`) y el texto se desvanece, con 450 ms de espera antes de navegar.

Texto: **"Buscar mi viaje ideal"**.

---

## El elemento con más personalidad: las etiquetas de equipaje

Es lo que hay que reproducir con más cuidado, porque es lo que hace que no parezca una plantilla.

Cada opción de "tipo de viaje" y de "qué te apetece hacer" es un botón con forma de **etiqueta de maleta**: esquina superior derecha recortada y un ojal.

```css
clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%);
```

Sin seleccionar: fondo `bg-white/10`, borde izquierdo de 4px del color del tema, y una **ligera inclinación distinta en cada una** (`-rotate-2`, `rotate-1`, `-rotate-3`…, rotando por una lista). Esa variación es lo que da el aire de sellos pegados a mano en vez de botones clonados.

Al seleccionarse: se rellena de color sólido, se endereza, y hace `animate-tag-swing` — se balancea y se asienta, como una etiqueta que acaba de sellarse.

Al pasar el ratón: sube medio píxel y se endereza.

Cada etiqueta lleva su icono dentro de un círculo translúcido, y el ojal es un punto pequeño arriba a la derecha.

**Accesibilidad:** el estado va en `aria-pressed`, y el color no puede ser el único indicador — con la inclinación y el relleno ya hay dos señales más, mantenlas.

---

## Punto importante: las preferencias no se copian tal cual

Aquí la referencia y tu motor no encajan, y **hay que resolverlo a tu favor**.

En la referencia, las preferencias son un interruptor: una lista de las elegidas, encendido o apagado.

En el tuyo son un perfil de niveles de 0 a 3, porque es lo que pide la sección 6.2 de la especificación y es lo que consume tu algoritmo de afinidad. Si lo conviertes en interruptor, tiras la mitad de la información que usa tu motor para puntuar.

**La solución:** misma etiqueta de equipaje, mismo aspecto, pero cada clic **avanza el nivel** 0 → 1 → 2 → 3 → 0. El nivel se ve dentro de la etiqueta con tres marcas pequeñas (rellenas según el nivel), y la opacidad del relleno acompaña. Nivel 0 es el estado sin seleccionar de siempre.

En `aria-label` va el nivel actual en texto, para que un lector de pantalla lo anuncie: "Gastronomía, nivel 2 de 3".

Se ve igual, y no pierdes nada.

Lo mismo aplica al selector de moneda y a la casilla de maleta facturada: son tuyos, la referencia no los tiene, y no se quitan. Se estilan con el mismo lenguaje.

---

## Iconos

Un componente `Icon` con un set propio en SVG, con estos nombres: `plane`, `suitcase`, `mapPin`, `sun`, `moon`, `compass`, `externalLink`, `footprint`, `utensils`, `download`, `edit`. Acepta `size`, `className` y `filled`.

No metas una librería de iconos: son once, van en un fichero, y así no engordan el bundle.

---

## Animaciones

Seis, definidas en `src/index.css`, **todas dentro de un bloque que las anule con `prefers-reduced-motion: reduce`**:

| Nombre | Qué hace | Dónde |
|---|---|---|
| `fade-in-up` | Sube 14px apareciendo, 0.45s | Bloques del hero y campos, escalonados |
| `tab-hop` | Una huella que "salta" y aterriza | Bajo la pestaña activa del día |
| `slide-in-trail` | Entra desde la derecha 18px | Contenido al cambiar de pestaña |
| `tag-swing` | Se balancea y se asienta | Etiqueta al seleccionarse |
| `plane-takeoff` | Despega en diagonal y desaparece | Avión del botón al enviar |
| `fade-out` | Desvanece, 0.3s | Texto del botón al enviar |

`tag-swing` y `tab-hop` usan `cubic-bezier(0.34, 1.56, 0.64, 1)` — el rebote es parte del carácter.

---

## Un arreglo de la referencia que sí conviene copiar

Chromium fuerza un fondo sólido en los campos autocompletados que ningún CSS normal tumba. Sobre fondo oscuro, eso deja los campos en blanco. El apaño estándar:

```css
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
input:autofill {
  -webkit-text-fill-color: #fff;
  caret-color: #fff;
  box-shadow: 0 0 0 1000px transparent inset;
  transition: background-color 9999s ease-in-out 0s;
}
```

---

## Comprobación de cierre

1. `npm run build` y `npm test` en verde, con los 796 tests.
2. Ni un fichero de `server/`, `api/` o `supabase/` modificado.
3. Contraste comprobado sobre el fondo con foto, texto por texto.
4. Foco visible en todos los controles, incluidas las etiquetas de equipaje.
5. Navegación completa con teclado.
6. `prefers-reduced-motion` desactiva las seis animaciones.
7. Responsive hasta móvil: el mosaico de 5×2 y el formulario en dos columnas tienen que aguantar a 375px.
8. Las preferencias siguen mandando niveles de 0 a 3 al backend. Compruébalo en la petición real, no solo en los tests.
9. Sin claves nuevas con prefijo `VITE_`.
10. Atribución de las fotos de Wikimedia en el pie o en el README.

---

## Después

Con esto llegas al mismo aspecto que la referencia, sobre un motor con 796 tests, endpoint con límite de peticiones, validación completa y despliegue verificado. De ahí en adelante ya construís los dos desde este repositorio.
