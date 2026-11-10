// Browser tests run against scripts/serve-static.mjs, which serves only the files
// Cloudflare deploys, with the real _headers, _redirects and worker.js.
// Locally, PW_CHANNEL=msedge reuses installed Edge instead of downloading Chromium.
import { defineConfig, devices } from '@playwright/test';

const channel = process.env.PW_CHANNEL || undefined;
const PORT = 4173;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Two workers keep 4-vCPU CI runners from timing out on the video tests.
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--mute-audio'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, channel } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel } },
  ],
  webServer: {
    command: `node scripts/serve-static.mjs --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
