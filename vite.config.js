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
});
