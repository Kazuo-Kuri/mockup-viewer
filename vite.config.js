// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./", // ← サブパス配信でも相対パスで動く
  plugins: [react()],
  assetsInclude: [
    "**/*.hdr",
    "**/*.glb",
    "**/*.gltf",
    "**/*.bin",
    "**/*.ktx2",
    "**/*.basis"
  ],
  server: {
    proxy: {
      "/compose_scene": {
        target: "http://localhost:5001",
        changeOrigin: true,
        // secure: false, // https→http の場合など必要なら有効化
      }
    }
  }
});
