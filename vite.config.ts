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
        "dev-load-checker": resolve("./src/dev-load-checker.ts"),
      },
      output: {
        dir: resolve("./dist"),
        format: "esm",
        entryFileNames: "[name].js",
        inlineDynamicImports: false,
      },
    },
    minify: false,
  },
});
