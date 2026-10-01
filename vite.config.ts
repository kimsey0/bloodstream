import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// ARTIFACT=1 builds only the main app as one self-contained bundle (see scripts/artifact.mjs).
const artifact = !!process.env.ARTIFACT;

export default defineConfig({
  base: './',
  plugins: [svelte()],
  build: {
    outDir: artifact ? 'dist-artifact' : 'dist',
    rollupOptions: {
      input: artifact ? { main: 'index.html' } : { main: 'index.html', diagnostics: 'diagnostics.html' },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
