export default {
  build: {
    lib: {
      entry: 'src/orwel.js',
      name: 'orwel',
      fileName: () => `orwel.js`,
      formats: ['iife']
    }
  }
}