import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://guilhermetosin.github.io',
  base: '/portal-mesas-proprietarias',
  integrations: [
    tailwind({
      // Isso resolve o aviso de "content missing"
      applyBaseStyles: false,
    })
  ],
});