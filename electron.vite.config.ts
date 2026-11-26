import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  main: { plugins: [externalizeDepsPlugin({exclude:["zod", "@agentclientprotocol/sdk", "sax", "yauzl"]})] },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: { server: { hmr: false }, plugins: [react(), tailwindcss()] },
});
