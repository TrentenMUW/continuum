import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The production build is served from https://trentenmuw.github.io/continuum/ (D1).
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/continuum/" : "/",
  plugins: [react()],
}));
