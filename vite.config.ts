import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { apiDevServer } from './vite-plugins/api-dev-server.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), apiDevServer()],
  test: {
    // El grueso de los tests son de servidor y algoritmos. Los de componentes
    // piden jsdom con una anotación `@vitest-environment` en su cabecera, para
    // no pagar el coste del DOM en los otros trescientos.
    environment: 'node',
  },
})
