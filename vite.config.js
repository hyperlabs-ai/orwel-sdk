export default {
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'orwel',
      fileName: () => `orwel.js`,
      formats: ['iife']
    }
  }
}