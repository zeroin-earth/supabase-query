// @ts-check

import eslint from '@eslint/js'
import { defineConfig } from 'eslint/config'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import tseslint from 'typescript-eslint'

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    ignores: [
      'eslint.config.mjs',
      'tsdown.config.ts',
      'dist/**',
      'react-native/**',
      'node_modules/**',
      // The teams installer (plain Node ESM) and the Deno Edge Functions are not
      // part of the library's TS program — they run in other runtimes.
      'bin/**',
      'supabase/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      'simple-import-sort/imports': [
        'warn',
        {
          groups: [
            // 1. Side effect imports first (e.g. polyfills, global styles).
            ['^\\u0000'],
            // 2. `react` and other packages.
            ['^react$', '^@?\\w'],
            // 3. Absolute / aliased imports (`@/foo`, `~/foo`).
            ['^@', '^~'],
            // 4. Relative imports.
            ['^\\./', '^\\.\\./', '^\\.\\.'],
          ],
        },
      ],
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          ignoreVoid: true,
          allowForKnownSafeCalls: [
            {
              from: 'package',
              name: ['mock', 'module'],
              package: 'bun:test',
            },
          ],
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
)
