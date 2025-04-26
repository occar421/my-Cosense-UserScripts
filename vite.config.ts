import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  preview: {
    port: 3000,
    strictPort: true,
    cors: {
      origin: true,
      methods: ["GET"],
      credentials: true,
    },
  },
  build: {
    rollupOptions: {
      input: {
        "block-backlink": resolve("./src/block-backlink.ts"),
      },
      output: {
        dir: resolve("./dist"),
        format: "iife",
        entryFileNames: "[name].js",
      },
    },
  },
});
