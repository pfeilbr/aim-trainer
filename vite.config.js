import { defineConfig } from 'vite';

// base is needed for GitHub Pages project hosting (https://<user>.github.io/aim-trainer/)
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/aim-trainer/' : '/',
});
