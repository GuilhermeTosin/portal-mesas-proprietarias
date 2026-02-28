import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';

const isGithubActions = process.env.GITHUB_ACTIONS === 'true';

export default defineConfig({
  site: 'https://guilhermetosin.github.io',
  base: '/portal-mesas-proprietarias',
  output: isGithubActions ? 'static' : 'server',
  adapter: isGithubActions ? undefined : node({
    mode: 'standalone',
  }),
  integrations: [tailwind()],
});