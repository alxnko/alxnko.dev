import { defineConfig } from "astro/config";
import { slimGltfPlugin } from "./scripts/slim-gltf.mjs";

export default defineConfig({
  site: "https://alxnko.dev",
  output: "static",
  // every stylesheet inline (hashed into the CSP by scripts/postbuild-csp.ts): no
  // render-blocking CSS request before the first paint
  build: {
    inlineStylesheets: "always",
  },
  vite: {
    plugins: [slimGltfPlugin()],
    build: {
      assetsInlineLimit: 0,
    },
  },
});
