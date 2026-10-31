import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';

// Every .html at the root and in the part folders is a page.
const DIRS = ['.', 'perception', 'control'];
const pages = Object.fromEntries(DIRS.flatMap((d) => readdirSync(resolve(__dirname, d)).filter((f) => f.endsWith('.html'))
  .map((f) => [`${d === '.' ? '' : d + '/'}${f.replace('.html', '')}`, resolve(__dirname, d, f)])));

export default defineConfig({
  base: '/talos-explained/',
  build: { rollupOptions: { input: pages }, chunkSizeWarningLimit: 1200 },
  worker: { format: 'es' },
  server: { host: '127.0.0.1' },
});
