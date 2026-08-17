import { defineConfig } from "vitest/config";
import path from "path";

// Deliberately does not reuse vite.config.ts: the app config loads the
// TanStack Start and Nitro build plugins, which expect a real dev/build
// pipeline and are irrelevant to unit tests.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
