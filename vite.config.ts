import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Production builds are served from the GitHub Pages repository subpath
// (https://<user>.github.io/VoltaGame/). Override with VITE_BASE if hosting elsewhere.
export default defineConfig(({ command, isPreview }) => ({
  base: process.env.VITE_BASE ?? (command === 'build' || isPreview ? '/VoltaGame/' : '/'),
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}));
