import { defineConfig } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
const local = existsSync(".local/dev.json")
  ? JSON.parse(readFileSync(".local/dev.json", "utf8"))
  : { url: "http://127.0.0.1:5173" };
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.pw.ts",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.SHOV_URL || local.url,
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
