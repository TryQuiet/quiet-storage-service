import { createJsWithTsEsmPreset, type JestConfigWithTsJest } from 'ts-jest'

const presetConfig = createJsWithTsEsmPreset({
  tsconfig: '<rootDir>/tsconfig.json',
})

const jestConfig: JestConfigWithTsJest = {
  ...presetConfig,
  testRegex: 'src/.*.spec.ts$',
  rootDir: '..',
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
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
