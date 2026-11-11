/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '(src|test)/.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/*.module.ts'],
  coverageDirectory: 'coverage',
  // Plan de calidad: 80 % o más de cobertura de líneas en las reglas de domain
  coverageThreshold: { './src/domain/': { lines: 80 } },
};
