import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The Spring Boot API (./mvnw spring-boot:run in ../backend).
    proxy: { '/api': 'http://localhost:8080' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    // Playwright's end-to-end tests (npm run e2e) need a running server.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
