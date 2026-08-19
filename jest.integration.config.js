/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/integration/jest.setup.ts'],
  clearMocks: true,
};
