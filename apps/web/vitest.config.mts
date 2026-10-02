import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next.js preserves JSX; component tests need an executable JSX transform.
  oxc: { jsx: { runtime: "automatic" } },
});
