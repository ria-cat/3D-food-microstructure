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
  },
});
