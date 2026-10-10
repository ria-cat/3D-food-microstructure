// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  integrations: [react({ compiler: true })],
  site: "https://ria-cat.github.io",
  base: "/3D-food-microstructure",
  vite: {
    plugins: [tailwindcss()],
    build: {
      // The only chunk above Vite's default 500 kB warning threshold is the
      // lazily-loaded 3D viewer, which is essentially all of three.js (its
      // WebGLRenderer pulls in the whole library, so it cannot be shrunk
      // further). The viewer's code is already code-split out of the initial
      // page load, so allow this one on-demand chunk a higher limit.
      chunkSizeWarningLimit: 600,
    },
  },
});
