import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jest from 'eslint-plugin-jest';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', '*.cjs', '*.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // Los módulos de NestJS son clases vacías con decorador
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      // Un parámetro que empieza por "_" se declara a propósito sin usar (por ejemplo, en el verde mínimo de TDD)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.spec.ts'],
    ...jest.configs['flat/recommended'],
    rules: {
      ...jest.configs['flat/recommended'].rules,
      // Prohibido subir pruebas enfocadas o saltadas (it.only, it.skip, xit…)
      'jest/no-focused-tests': 'error',
      'jest/no-disabled-tests': 'error',
    },
  },
  prettier,
);
