import preset from 'ts-jest/presets/index.js';

/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  ...preset.defaultsESM,
  resolver: 'ts-jest-resolver',
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
        useESM: true,
      },
    ],
  },
  rootDir: "..",
  testEnvironment: "node",
  testRegex: "src/.*.spec.ts$",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },
};