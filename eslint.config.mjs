import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.strict,
  {
    files: ['src/**/*.ts'],
    rules: {
      'max-lines-per-function': [
        'error',
        { max: 15, skipBlankLines: true, skipComments: true }
      ]
    }
  },
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**']
  }
);
