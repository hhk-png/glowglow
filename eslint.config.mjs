import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: [
      'preview/**',
    ],
  },
  {
    files: ['test/**'],
    rules: {
      // the suites assert on literal `${…}` text, which is the point of the test
      'no-template-curly-in-string': 'off',
    },
  },
  {
    files: ['bench/**'],
    rules: {
      // the bench measures the built bundle on purpose; `pnpm bench` builds first
      'antfu/no-import-dist': 'off',
    },
  },
)
