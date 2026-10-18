import { defineConfig } from 'bumpp'

// Keep the core package and both adapters on the same version; the release
// workflow checks all three against the pushed tag before publishing.
export default defineConfig({
  files: [
    'packages/glowglow/package.json',
    'packages/react/package.json',
    'packages/vue/package.json',
  ],
})
