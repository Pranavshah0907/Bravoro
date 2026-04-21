import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

// Plugin: writes public/version.json at build/dev start so the app can detect new deployments
const versionPlugin = () => ({
  name: "version-json",
  buildStart() {
    const version = { version: Date.now().toString() };
    fs.writeFileSync(
      path.resolve(__dirname, "public/version.json"),
      JSON.stringify(version)
    );
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    versionPlugin(),
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
