// Local reconstruction of the `@epcvip/eslint-config-typescript` baseline: that package
// lives in EPCVIP's private registry and is not resolvable from this repository. The
// rulesets (strict-type-checked + stylistic-type-checked, import-x, unused-imports, next)
// and the override policy are the ones described in governance/standards/typescript/eslint.
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import importX from 'eslint-plugin-import-x';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['.next/**', 'node_modules/**', 'dist/**', 'next-env.d.ts'],
  },

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'import-x': importX,
      'unused-imports': unusedImports,
    },
    settings: {
      // `@/*` is this project's own path alias. Without this, import-x cannot
      // resolve it, classifies it as unknown, and sorts it after every declared
      // group — which is the opposite of the standard's ordering.
      'import-x/internal-regex': '^@/',
    },
    rules: {
      // The TypeScript standard mandates `type` aliases for object shapes, with
      // `interface` reserved for declaration merging or `extends`. The
      // typescript-eslint stylistic preset defaults to the opposite, so the
      // baseline has to flip it back.
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      'import-x/no-duplicates': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'unused-imports/no-unused-imports': 'error',
    },
  },

  {
    files: ['**/*.tsx'],
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },

  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  {
    files: ['eslint.config.mjs', 'next.config.ts', 'vitest.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
);
