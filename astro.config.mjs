import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://alxnko.dev",
  output: "static",
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});
