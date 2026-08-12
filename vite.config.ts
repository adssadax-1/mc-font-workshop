import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 官方推荐的 Vite 配置
export default defineConfig({
  plugins: [react()],

  // 防止 Vite 清屏导致 Tauri 控制台日志不可见
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // 忽略 Rust 目录的变更，避免触发无意义的前端重载
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target: "es2021",
    minify: "esbuild",
  },
});
