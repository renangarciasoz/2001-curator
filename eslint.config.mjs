// typescript-eslint strict + stylistic, both type-checked, plus import ordering,
// unused-import removal and the Next.js rules. `consistent-type-definitions` is
// flipped to `type` below: the preset defaults to `interface`, and this codebase
// uses `type` aliases for object shapes throughout.
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
        projectService: {
          // The root config files (eslint, postcss, next, vitest) are outside
          // tsconfig's `include`, so the project service cannot place them and
          // fails at parse time — before any rule, which is why turning the
          // type-aware rules off for them is not enough. These globs do not
          // cross directories, so they match only those four.
          allowDefaultProject: ['*.mjs', '*.ts'],
        },
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
    files: ['eslint.config.mjs', 'next.config.ts', 'postcss.config.mjs', 'vitest.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
);
