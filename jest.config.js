/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(test).ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  // Skip the platform runtimes — they import from 'react-native' which we
  // don't stand up in a pure-jest env. The prompt-engineered tool protocol
  // is pure JS and gets full coverage.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/lib/',
    'AppleFoundationModelsRuntime',
    'GeminiNanoRuntime',
    'RuntimeDispatch',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/AppleFoundationModelsRuntime.ts',
    '!src/GeminiNanoRuntime.ts',
    '!src/RuntimeDispatch.ts',
  ],
};
