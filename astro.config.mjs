import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  // O link oficial do seu site no GitHub Pages
  site: 'https://guilhermetosin.github.io',
  // O nome exato do seu repositório no GitHub (deve começar com barra)
  base: '/portal-mesas-proprietarias',
  integrations: [tailwind()],
});