import { fileURLToPath } from "node:url";
// @next/env is CommonJS, so ESM can only take its default export.
import nextEnv from "@next/env";
import { defineConfig } from "vitest/config";

// Vitest sets NODE_ENV=test before loading this file, so this reads the committed
// .env.test (then .env) and never .env.local, the same way Next.js does in tests.
nextEnv.loadEnvConfig(process.cwd());

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["{src,scripts}/**/*.test.ts"],
          exclude: ["**/*.int.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          include: ["src/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["src/test/setup-component.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["{src,scripts}/**/*.int.test.ts"],
          environment: "node",
          globalSetup: ["src/test/global-setup.ts"],
          setupFiles: ["src/test/setup-integration.ts"],
          // One shared database per run: files must not truncate each other's rows.
          fileParallelism: false,
        },
      },
    ],
  },
});
