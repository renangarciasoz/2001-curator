// Reconstrução local do baseline `@epcvip/eslint-config-typescript`: aquele pacote vive no
// registro privado da EPCVIP e não é resolvível a partir deste repositório. Os rulesets
// (strict-type-checked + stylistic-type-checked, import-x, unused-imports, next) e a
// política de override são os mesmos descritos em governance/standards/typescript/eslint.
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import importX from 'eslint-plugin-import-x';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['.next/**', 'node_modules/**', 'dist/**', 'src/generated/**', 'next-env.d.ts'],
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
    rules: {
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
