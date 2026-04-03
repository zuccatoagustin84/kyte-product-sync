import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "https://store-lyart-delta.vercel.app",
    headless: true,
    viewport: { width: 390, height: 844 },
  },
  timeout: 30000,
});
