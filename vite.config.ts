import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    watch: { ignored: ["**/.local/**", "**/data/**", "**/*.sqlite*"] },
    fs: {
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.local/**", "**/data/**", "**/*.sqlite*"],
    },
    proxy: {
      "/api/admin": `http://127.0.0.1:${process.env.ADMIN_API_PORT || "3002"}`,
      "/api": `http://127.0.0.1:${process.env.API_PORT || "3001"}`,
    },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        game: fileURLToPath(new URL("./index.html", import.meta.url)),
        admin: fileURLToPath(new URL("./admin.html", import.meta.url)),
      },
    },
  },
});
