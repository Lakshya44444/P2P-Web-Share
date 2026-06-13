import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  // simple-peer depends on Node core modules (events, util, stream, buffer).
  // These polyfills make them available in the browser bundle.
  plugins: [react(), nodePolyfills()],
  server: {
    port: 5173,
    strictPort: false,
  },
});
