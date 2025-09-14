// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // サブパス配信でも相対パスで動かす
  base: "./",

  plugins: [react()],

  // three の周辺アセットをバンドル対象に
  assetsInclude: [
    "**/*.hdr",
    "**/*.glb",
    "**/*.gltf",
    "**/*.bin",
    "**/*.ktx2",
    "**/*.basis",
  ],

  // 開発時のみ：ローカルAPI(Flask)へプロキシ
  // ※ API の本番URLは VITE_SCENE_API でフロントから直接呼びます。
  server: {
    proxy: {
      // 互換: 旧エンドポイントを使っているコードがあっても動くように
      "/compose_scene": {
        target: "http://localhost:5001",
        changeOrigin: true,
      },
      // 新エンドポイント
      "/compose": {
        target: "http://localhost:5001",
        changeOrigin: true,
      },
    },
  },

  build: {
    // 本番ビルド最適化
    sourcemap: false,      // 本番でソースマップ不要ならOFF
    minify: "esbuild",     // 既定。高速で十分小さい
    target: "es2018",      // 互換よりもサイズ優先（必要に応じ調整）

    // チャンク分割：初期ロードを軽量化 & 警告を抑制
    rollupOptions: {
      output: {
        // 主要依存を専用チャンクに分割
        manualChunks: {
          react: ["react", "react-dom"],
          three: ["three"],
        },
        // キャッシュ効率を高める命名
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },

    // 最後の保険（警告を実質黙らせる）。分割で十分でも、万一に備えて少しだけ上げておく。
    chunkSizeWarningLimit: 1000, // KB
  },
});
