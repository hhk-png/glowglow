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
)
