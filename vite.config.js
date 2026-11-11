import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({ base: "./", build: { target: "es2022", rollupOptions: { input: { main: resolve(process.cwd(), "index.html"), arena3d: resolve(process.cwd(), "arena3d.html") } } } });
