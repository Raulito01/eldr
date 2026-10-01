import { defineConfig } from 'vite';

// ELDR dev server + bundler config.
// test-pages/*.html are built as extra entry points so they work in production builds too.
export default defineConfig({
  server: { open: true },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: 'index.html',
        gallery: 'test-pages/gallery.html',
      },
    },
  },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
