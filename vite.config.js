import { defineConfig } from 'vite';

// Relative base so the built static site works from any host path
// (GitHub Pages subpath, a plain file server, etc.).
export default defineConfig({
  base: './',
});
