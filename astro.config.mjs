// @ts-check
import { defineConfig, fontProviders } from "astro/config";

import react from "@astrojs/react";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  integrations: [react({ compiler: true })],
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Georgia",
      cssVariable: "--font-georgia",
      fallbacks: ["Times New Roman", "serif"],
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/georgia/georgia.woff"],
            weight: "400",
            style: "normal",
          },
          {
            src: ["./src/assets/fonts/georgia/georgiai.woff"],
            weight: "400",
            style: "italic",
          },
          {
            src: ["./src/assets/fonts/georgia/georgiab.woff"],
            weight: "700",
            style: "normal",
          },
          {
            src: ["./src/assets/fonts/georgia/georgiaz.woff"],
            weight: "700",
            style: "italic",
          },
        ],
      },
    },
  ],
  site: "https://ria-cat.github.io",
  base: "/3D-food-microstructure",
  vite: {
    plugins: [tailwindcss()],
    build: {
      // The only oversized chunk is the lazily-loaded 3D viewer. TSL's node
      // renderer and WebGL fallback make it larger than the previous shader
      // material bundle, but it remains code-split out of the initial page load.
      chunkSizeWarningLimit: 1000,
    },
  },
});
