import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: [
      '**/preview/**',
      '**/dist/**',
    ],
  },
  {
    files: ['**/test/**'],
    rules: {
      // the suites assert on literal `${…}` text, which is the point of the test
      'no-template-curly-in-string': 'off',
    },
  },
  {
    files: ['**/bench/**', '**/test/runtime-smoke.mjs'],
    rules: {
      // these run against the built package on purpose
      'antfu/no-import-dist': 'off',
    },
  },
)
