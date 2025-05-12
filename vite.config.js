import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'orwel',
      fileName: (format) => `orwel.${format}.js`,
      formats: ['es', 'umd']
    },
    rollupOptions: {
      output: {
        preserveModules: false,
        inlineDynamicImports: true,
        exports: 'named',
        globals: {
          window: 'window',
          document: 'document'
        }
      },
      external: []
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});