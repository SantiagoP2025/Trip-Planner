import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { apiDevServer } from './vite-plugins/api-dev-server.ts'

// Las dos librerías pesadas del proyecto se cargan con `import()` dinámico, así
// que Rollup ya las dejaba en fragmentos aparte. Lo que hace esto es ponerles
// nombre: por defecto los llamaba `dist-*.js` y `es-*.js`, que salen del fichero
// de entrada de cada paquete y no dicen nada. Con nombre, la salida de
// `npm run build` se lee sola y una regresión de tamaño tiene dueño.
function vendorChunk(id: string): string | undefined {
  if (/node_modules\/(pdf-lib|@pdf-lib|pako)\//.test(id)) return 'pdf'
  if (/node_modules\/@supabase\//.test(id)) return 'supabase'
  return undefined
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), apiDevServer()],
  build: {
    rollupOptions: {
      output: { manualChunks: vendorChunk },
    },
  },
  test: {
    // El grueso de los tests son de servidor y algoritmos. Los de componentes
    // piden jsdom con una anotación `@vitest-environment` en su cabecera, para
    // no pagar el coste del DOM en los otros trescientos.
    environment: 'node',
  },
})
