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
      "test/*"
    ],
  }
];