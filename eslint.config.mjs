import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import jsdoc from 'eslint-plugin-jsdoc';
import prettier from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import eslintPluginUnusedImports from 'eslint-plugin-unused-imports';
import path from 'path';

/**
 * ESLint 9 (flat config) for parking_simert.
 *
 * Implements the "Criterio Anexo 2" quality matrix. Every rule is annotated with
 * the criterion it enforces and the required severity (ERROR / WARN).
 *
 * Formatting criteria (2-space indent, operator spacing) are delegated to Prettier
 * through `prettier/prettier`, so ESLint and Prettier can never disagree. Naming
 * rules are ERROR but exempt object/class properties, because those map to DB
 * columns, DTO fields, SQL aliases and API payloads (contracts that must not change).
 */
export default [
  // ── Global ignores ─────────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'submodule/**',
      // src/common is a git submodule (separate repo); it is linted there,
      // never modified here, so its findings are not this project's to fix.
      'src/common/**',
      'test/**',
      '**/*.spec.ts',
      '**/__tests__/**',
      'eslint.config.js',
    ],
  },

  // ── Main ruleset for all TypeScript sources ────────────────────────────
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: path.resolve('./tsconfig.json'),
        tsconfigRootDir: path.resolve(),
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'unused-imports': eslintPluginUnusedImports,
      'simple-import-sort': simpleImportSort,
      prettier,
      jsdoc,
    },
    rules: {
      // ── Base TypeScript relaxations (kept from the original config) ─────
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',

      // ════════════════════════ NOMENCLATURA ════════════════════════════
      // camelCase for variables/functions/methods + PascalCase for classes (ERROR).
      // Properties/fields use `format: null`: they are DB columns, DTO fields,
      // SQL aliases and API payloads — contracts that must not be renamed.
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: ['function', 'classMethod', 'typeMethod'],
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        // Classes, interfaces, enums and type aliases → PascalCase.
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['UPPER_CASE', 'PascalCase'] },
        // Contracts: do not enforce a case on object/class properties.
        {
          selector: [
            'property',
            'classProperty',
            'parameterProperty',
            'objectLiteralProperty',
            'typeProperty',
          ],
          format: null,
        },
        { selector: 'import', format: ['camelCase', 'PascalCase'] },
      ],
      // Descriptive names, minimum 2 characters (WARN).
      'id-length': [
        'warn',
        { min: 2, exceptions: ['_', 'i', 'j', 'k', 'x', 'y', 'z', 'e'] },
      ],
      // Forbid generic placeholder names such as temp/foo/bar (ERROR).
      'id-denylist': ['error', 'temp', 'tmp', 'foo', 'bar', 'baz', 'qux', 'aux'],

      // ════════════════════════ INDENTACIÓN ═════════════════════════════
      // 2-space indent + spacing around operators are enforced by Prettier (ERROR).
      'prettier/prettier': 'error',
      // No multiple consecutive blank lines (ERROR).
      'no-multiple-empty-lines': ['error', { max: 1, maxBOF: 0, maxEOF: 0 }],
      // Blank line between functions and classes (ERROR).
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'function', next: 'function' },
        { blankLine: 'always', prev: 'function', next: 'class' },
        { blankLine: 'always', prev: 'class', next: 'function' },
        { blankLine: 'always', prev: 'class', next: 'class' },
      ],
      'lines-between-class-members': [
        'error',
        'always',
        { exceptAfterSingleLine: true },
      ],

      // ════════════════════════ ESTRUCTURA ══════════════════════════════
      // Consistent, ordered file structure: sorted imports/exports (ERROR).
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      // Group code in cohesive units: one class per file (ERROR).
      'max-classes-per-file': ['error', 1],

      // ─────────────────── COMPLEJIDAD / SOLID-SRP ───────────────────────
      // Controlled cyclomatic complexity (WARN).
      complexity: ['warn', 10],
      // Single-responsibility proxy: keep functions short (WARN).
      'max-lines-per-function': [
        'warn',
        { max: 80, skipBlankLines: true, skipComments: true },
      ],

      // ════════════════════════ DOCUMENTACIÓN ═══════════════════════════
      // Require a JSDoc block on classes, methods and functions (WARN).
      // NOTE: enforcing the specific @author/@date tags is not possible with the
      // standard jsdoc rules; require-jsdoc guarantees the doc block is present.
      'jsdoc/require-jsdoc': [
        'warn',
        {
          publicOnly: false,
          require: {
            ClassDeclaration: true,
            MethodDefinition: true,
            FunctionDeclaration: true,
          },
        },
      ],
      // Document parameters and return values (WARN).
      'jsdoc/require-param': 'warn',
      'jsdoc/require-returns': 'warn',
    },
  },

  // ── DTOs / entities / interfaces ───────────────────────────────────────
  // Grouping several related classes in one file (e.g. a family of DTOs or a
  // response shape with nested types) is cohesive and idiomatic, so the
  // "one class per file" rule does not apply here. True over-coupling is
  // covered by SonarQube (typescript:S1200). Note: src/common is a submodule
  // and must not be modified regardless.
  {
    files: [
      '**/dto/**/*.ts',
      '**/*.dto.ts',
      '**/entities/**/*.ts',
      '**/*.interface.ts',
      '**/intefaces/**/*.ts',
    ],
    rules: {
      'max-classes-per-file': 'off',
    },
  },
];
