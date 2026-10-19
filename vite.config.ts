import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The production build is served from https://trentenmuw.github.io/continuum/ (D1).
// `vite preview` serves that build, so it needs the same base (it runs as "serve").
export default defineConfig(({ command, isPreview }) => ({
  base: command === "build" || isPreview ? "/continuum/" : "/",
  plugins: [react()],
}));
