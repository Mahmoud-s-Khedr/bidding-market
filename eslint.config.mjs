// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/next-env.d.ts',
      '**/playwright-report/**',
      '**/*.config.{js,mjs,cjs}',
      '**/vitest.config.ts',
      '**/prisma.config.ts',
      '**/vitest.integration.config.ts',
      '**/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['**/*.{spec,test,e2e-spec}.ts', '**/test/**/*.ts', '**/e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    // Unit specs under src/ must not boot the app or touch the DB: CI runs them without Postgres.
    // DB-backed tests belong in apps/api/test/*.int-spec.ts.
    files: ['apps/*/src/**/*.spec.ts', 'apps/*/src/**/*.spec.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/test/helpers/*', '**/test/helpers'],
              message:
                'Unit specs must not use integration helpers. Move DB-backed tests to test/*.int-spec.ts.',
            },
          ],
          paths: [
            {
              name: 'supertest',
              message: 'HTTP-level tests are integration tests. Move them to test/*.int-spec.ts.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
