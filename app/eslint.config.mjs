import love from 'eslint-config-love'
import prettier from 'eslint-config-prettier'
import eslintComments from 'eslint-plugin-eslint-comments'
import jest from 'eslint-plugin-jest'

export default [
  {
    ...love,
  },
  {
    ...prettier,
  },
  {
    plugins: {
      'eslint-comments': eslintComments,
    },
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/prefer-destructuring': 'warn',
      '@typescript-eslint/no-unsafe-type-assertion': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/init-declarations': 'off',
      'max-nested-callbacks': 'off',
      '@typescript-eslint/class-methods-use-this': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'eslint-comments/no-unused-disable': 'off',
      'eslint-comments/no-unused-enable': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      complexity: ['error', { variant: 'modified' }],
    },
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
    {
    plugins: {
      jest,
    },
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/init-declarations': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'promise/avoid-new': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
      'max-nested-callbacks': 'off',
      'max-lines': 'off',
    },
  },
  {
    ignores: ['**/*.config.mjs', 'dist/*', 'src/migrations/*'],
  },
]
