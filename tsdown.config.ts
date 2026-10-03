import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/incremental.ts', 'src/dom.ts'],
    format: ['esm', 'cjs'],
    target: 'es2022',
    platform: 'neutral',
    dts: true,
    clean: true,
    sourcemap: true,
  },
  {
    // One self-contained classic script for preview/editor.html, which is opened
    // straight off disk — browsers refuse to load ES modules over file://.
    entry: ['preview/preview-entry.ts'],
    format: ['iife'],
    globalName: 'glowglow',
    target: 'es2022',
    platform: 'browser',
    outDir: 'preview',
    outputOptions: { entryFileNames: 'glowglow.preview.js' },
    dts: false,
    sourcemap: false,
    clean: false,
  },
])
