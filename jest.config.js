/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts'],
  coverageThreshold: {
    global: {
      branches: 80,
      lines: 80
    }
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs' } }]
  }
};
