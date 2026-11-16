import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 直接引用 @solar/shared 的 TS 源码，避免其 CJS 产物无法被 rollup 静态分析具名导出
const sharedSource = fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@solar/shared': sharedSource,
    },
  },
  server: { port: 5174, host: '0.0.0.0' },
  build: { outDir: 'dist' },
});
