import love from 'eslint-config-love'
import prettier from 'eslint-config-prettier'
import eslintComments from 'eslint-plugin-eslint-comments'

export default [
  {
    ...love,
  },
  {
    ...prettier,
  },
  {
      plugins: {
        'eslint-comments': eslintComments
      },
      rules: {
        '@typescript-eslint/no-magic-numbers': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        "@typescript-eslint/prefer-destructuring": "warn",
        "@typescript-eslint/no-unsafe-type-assertion": "warn",
        "@typescript-eslint/no-misused-promises": "warn",
        "@typescript-eslint/no-unnecessary-condition": "warn",
        'max-nested-callbacks': 'off',
        '@typescript-eslint/class-methods-use-this': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
        'eslint-comments/no-unused-disable': 'off',
        'eslint-comments/no-unused-enable': 'off'
      },
      files: [
        "src/**/*.ts",
        "scripts/**/*.ts",
      ],
      linterOptions: {
        reportUnusedDisableDirectives: 'off',
      },
  },
  {
    ignores: [
      "**/*.config.mjs", 
      "dist/*",
      'src/migrations/*'
    ],
  }
];