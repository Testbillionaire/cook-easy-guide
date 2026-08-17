import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import path from "path";

// Load ALL env vars (no prefix) into process.env for server-side code (webhooks,
// auth email route). VITE_-prefixed vars reach the client via import.meta.env.
const serverEnv = loadEnv(process.env.NODE_ENV || "development", process.cwd(), "");
Object.assign(process.env, serverEnv);

export default defineConfig({
  // Vite uses PostCSS in dev but Lightning CSS at build, so build-only transforms
  // can break the built output while the dev preview looks fine. Run Lightning CSS
  // in both to keep dev honest.
  css: { transformer: "lightningcss" },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "entities/lib/decode.js": path.resolve(__dirname, "node_modules/entities/lib/decode.js"),
      "entities/lib/encode.js": path.resolve(__dirname, "node_modules/entities/lib/encode.js"),
      entities: path.resolve(__dirname, "node_modules/entities"),
    },
    // Duplicate copies of React or Query break hooks and cache identity.
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },

  // Dep re-optimization rotates the optimized-dep hash and 504s tabs still holding
  // the old one. Pre-bundle the always-present client deps and tolerate stale
  // requests. React core only: pulling in @tanstack/react-start would drag its
  // node:async_hooks server entry into the client bundle and crash hydration.
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
    ignoreOutdatedRequests: true,
  },

  // Plugin order matters: Tailwind and path resolution first, then Start, then the
  // Nitro build, with React last.
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR
      // error wrapper). Nitro builds from this.
      server: { entry: "server" },
      // Fail the build if server-only code is pulled into a client bundle.
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    nitro({ preset: "vercel" }),
    viteReact(),
  ],
});
