// import preset from 'ts-jest/presets/index.js';
//
// /** @type {import('ts-jest').JestConfigWithTsJest} */
// export default {
//   ...preset.defaultsESM,
//   resolver: 'ts-jest-resolver',
//   setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
//   // globalTeardown: '<rootDir>/test/jest.teardown.ts',
//   transform: {
//     '^.+\\.tsx?$': [
//       'ts-jest',
//       {
//         tsconfig: 'tsconfig.json',
//         useESM: true,
//       },
//     ],
//   },
//   rootDir: ".",
//   testEnvironment: "node",
//   testRegex: ".e2e.spec.ts$",
//   moduleNameMapper: {
//     "^(\\.{1,2}/.*)\\.js$": "$1"
//   },
//   setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
// };

import { createJsWithTsEsmPreset, type JestConfigWithTsJest } from 'ts-jest'

const presetConfig = createJsWithTsEsmPreset({
  tsconfig: '<rootDir>/tsconfig.json',
})

const jestConfig: JestConfigWithTsJest = {
  ...presetConfig,
  testRegex: '.*.e2e.spec.ts$',
  rootDir: '.',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.[jt]sx?$': [
      'ts-jest',
      { tsconfig: 'tsconfig.spec.json', useESM: true },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
}

export default jestConfig
