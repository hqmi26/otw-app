import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Lets phones reach the app through a temporary Cloudflare test link (*.trycloudflare.com).
const allowedHosts = ['.trycloudflare.com'];

export default defineConfig({
  plugins: [react()],
  // The project lives in OneDrive, where normal file watching can miss changes.
  server: { allowedHosts, watch: { usePolling: true, interval: 300 } },
  preview: { allowedHosts },
});
