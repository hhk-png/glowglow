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
      // The suites assert on literal `${…}` text to prove that double-quoted
      // strings are not interpolated, so this rule is a false positive here.
      'no-template-curly-in-string': 'off',
    },
  },
)
