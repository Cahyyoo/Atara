import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the "@/*" -> "./src/*" mapping in tsconfig.json.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      /**
       * `server-only` throws on import unless the bundler resolves it under
       * React's "react-server" condition, which vitest does not. That guard is
       * worth having in the app -- it is what keeps a service token from ever
       * reaching a browser bundle -- but it also made every module carrying it
       * untestable, and those are the modules that talk to the outside.
       *
       * Pointed at the package's own empty entry rather than switching the
       * whole suite to the react-server condition, which would change how
       * React and Next resolve for every component test as well. This changes
       * one specifier to the empty file the package already ships.
       */
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    /**
     * The default 5s suits the node unit tests, which finish in milliseconds.
     * It does not suit the jsdom ones: driving a Base UI Select means rendering
     * its portal and waiting for the listbox, and a test that does that four
     * times takes a second and a half on its own — then longer again while
     * twenty-odd workers compete for this machine. They were timing out under
     * load while passing in isolation, which is the worst kind of red.
     */
    testTimeout: 20000,
    setupFiles: ["./vitest.setup.ts"],
  },
});
