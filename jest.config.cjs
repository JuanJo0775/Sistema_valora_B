/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  globalSetup: '<rootDir>/test/global-setup.ts',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '(src|test)/.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  // Issue #101: las pruebas de integración comparten la base valora_test y la vacían antes de cada
  // caso; en paralelo se borran los datos unas a otras. Una suite a la vez, en todo computador y en la CI.
  maxWorkers: 1,
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/*.module.ts'],
  coverageDirectory: 'coverage',
  // Plan de calidad: 80 % o más de cobertura de líneas en las reglas de domain
  coverageThreshold: { './src/domain/': { lines: 80 } },
};
