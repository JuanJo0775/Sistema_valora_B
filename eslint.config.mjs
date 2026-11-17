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
    // Scripts de k6 (#35): JavaScript que corre en k6, no en Node ni en tsc. Sin reglas con tipos y con
    // las variables globales que pone k6.
    files: ['test/load/**/*.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      parserOptions: { projectService: false },
      globals: { __ENV: 'readonly', __VU: 'readonly', __ITER: 'readonly' },
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
