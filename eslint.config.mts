// import js from "@eslint/js";
// import globals from "globals";
// import tseslint from "typescript-eslint";
// import pluginVue from "eslint-plugin-vue";
// import { defineConfig } from "eslint/config";

// export default defineConfig([
//   { files: ["**/*.{js,mjs,cjs,ts,mts,cts,vue}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.browser } },
//   tseslint.configs.recommended,
//   pluginVue.configs["flat/essential"],
//   { files: ["**/*.vue"], languageOptions: { parserOptions: { parser: tseslint.parser } } },
// ]);
// import js from "@eslint/js";
// import globals from "globals";
// import tseslint from "typescript-eslint";
// import pluginVue from "eslint-plugin-vue";
// import { defineConfig } from "eslint/config";

// export default defineConfig([
//   { files: ["**/*.{js,mjs,cjs,ts,mts,cts,vue}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.browser } },
//   tseslint.configs.recommended,
//   pluginVue.configs["flat/essential"],
//   { files: ["**/*.vue"], languageOptions: { parserOptions: { parser: tseslint.parser } } },
// ]);
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import jsdoc from 'eslint-plugin-jsdoc';
import prettier from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '.nuxt/**',
      '.output/**',
      'build/**',
      // Tests are not subject to the production lint rules (Anexo 2 policy):
      // they legitimately use `any` for mocks/spies and are excluded here.
      '**/*.spec.ts',
      '**/*.e2e-spec.ts',
      '**/*.test.ts',
      '**/__tests__/**',
      'test/**',
    ],
  },

  js.configs.recommended,

  ...tseslint.configs.recommended,

  ...vue.configs['flat/essential'],

  {
    files: ['**/*.{ts,tsx,js,jsx,vue}'],

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },

    plugins: {
      jsdoc,
      prettier,
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },

    rules: {
      // ==========================================================
      // 0. `any` permitido: el código de producción ya usa `any` en
      //    contratos externos (GIM/ANT) y respuestas dinámicas. Esta
      //    regla no debe romper un proyecto ya en producción.
      // ==========================================================
      '@typescript-eslint/no-explicit-any': 'off',

      // Unused vars are reported (as a warning) by `unused-imports/no-unused-vars`
      // below, which honors the `^_` ignore patterns. Disable the recommended
      // rule to avoid duplicate, stricter errors on already-shipped code.
      '@typescript-eslint/no-unused-vars': 'off',

      // ==========================================================
      // 1. camelCase para variables, funciones, métodos y parámetros
      // ==========================================================
      // Properties/fields use `format: null`: they map to DB columns, DTO
      // fields, SQL aliases and API payloads — contracts that must not be
      // renamed in a project already in production.
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

        // ==========================================================
        // 2. Clases, interfaces, enums y type aliases en PascalCase
        // ==========================================================
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

      // ==========================================================
      // 3-4. Formato (indentación 2 espacios, espaciado de operadores y
      //      palabras clave, llaves) delegado a Prettier. Las reglas core
      //      `indent`/`space-*` están deprecadas y formatean mal las
      //      propiedades de clase decoradas (NestJS/TypeORM), por eso se usa
      //      Prettier, que respeta los decoradores y nunca contradice al repo.
      // ==========================================================
      'prettier/prettier': 'error',

      // ==========================================================
      // 5. Sin líneas vacías múltiples
      // ==========================================================
      'no-multiple-empty-lines': [
        'error',
        {
          max: 1,
          maxEOF: 1,
          maxBOF: 0,
        },
      ],

      // ==========================================================
      // 6. Separación entre funciones y clases
      // ==========================================================
      'padding-line-between-statements': [
        'error',

        {
          blankLine: 'always',
          prev: 'function',
          next: 'function',
        },

        {
          blankLine: 'always',
          prev: 'class',
          next: 'class',
        },

        {
          blankLine: 'always',
          prev: 'class',
          next: 'function',
        },

        {
          blankLine: 'always',
          prev: 'function',
          next: 'class',
        },
      ],

      'lines-between-class-members': [
        'error',
        'always',
        {
          exceptAfterSingleLine: true,
        },
      ],

      // ==========================================================
      // 7. Documentación con JSDoc
      // ==========================================================
      'jsdoc/require-jsdoc': [
        'warn',
        {
          publicOnly: false,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
          },
        },
      ],

      'jsdoc/require-param': 'warn',
      'jsdoc/require-param-description': 'warn',
      'jsdoc/require-returns': 'warn',
      'jsdoc/require-description': 'warn',

      // ==========================================================
      // 8. Imports ordenados y sin uso
      // ==========================================================
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
    },
  },

  {
    files: ['**/*.vue'],

    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
);