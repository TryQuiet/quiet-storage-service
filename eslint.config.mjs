import love from 'eslint-config-love'
import prettier from 'eslint-config-prettier'

export default [
  {
    ...love,
  },
  {
    ...prettier,
  },
  {
      rules: {
        '@typescript-eslint/no-magic-numbers': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        "@typescript-eslint/prefer-destructuring": "warn",
        "@typescript-eslint/no-unsafe-type-assertion": "warn",
        'max-nested-callbacks': 'off',
        '@typescript-eslint/class-methods-use-this': 'off',
        '@typescript-eslint/no-explicit-any': 'warn'
      },
      files: [
        "src/**/*.ts",
        "scripts/**/*.ts",
      ],
  },
  {
    ignores: [
      "**/*.config.mjs", 
      "dist/*",
    ],
  }
];