import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base path ensures smooth hosting on any GitHub Pages repo URL
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173
  }
});
