import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
import prettier from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'build/**',
      // Submódulo git (se audita en su propio repositorio) y SQL generado por
      // TypeORM (no aplica estilo de código). Coherente con simert-auth y
      // simert-pay: sin esto, `--fix` alcanza el working tree del submódulo y
      // deja cambios sin commitear en un repositorio ajeno.
      'src/common/**',
      '**/migrations/**',
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

  // Desactiva las reglas de formato de los `recommended` que pueden chocar
  // con Prettier. Se coloca ANTES del bloque de reglas propias para no pisar
  // las reglas de espaciado explícitas definidas más abajo.
  eslintConfigPrettier,

  {
    // Backend NestJS: solo TypeScript/JavaScript. No hay archivos `.vue`,
    // por eso se retiró `eslint-plugin-vue` y su bloque de parser.
    files: ['**/*.{ts,tsx,js,jsx}'],

    languageOptions: {
      // Entorno Node, no browser: incluir `globals.browser` ocultaba usos
      // accidentales de `window`/`document` en código de servidor.
      globals: {
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
      // 0.b Contratos externos GIM/ANT y deuda técnica heredada.
      //     Coherente con el punto 0: reglas de `recommended` que
      //     chocan con código ya en producción no deben romper el build.
      // ==========================================================
      // Los enums de contrato replican valores de sistemas de terceros
      // (varios miembros comparten el mismo valor numérico a propósito).
      '@typescript-eslint/no-duplicate-enum-values': 'off',

      // Deuda real (no son contratos), visible como warning para que se
      // limpie sin bloquear el pipeline de un proyecto en producción.
      '@typescript-eslint/no-wrapper-object-types': 'warn',
      'no-useless-escape': 'warn',

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
          // PascalCase permitido para factories de decoradores custom estilo
          // class-validator (p. ej. `IsEnumStringOrNumber`).
          format: ['camelCase', 'PascalCase'],
          leadingUnderscore: 'allow',
        },

        // ==========================================================
        // 2. Clases, interfaces, enums y type aliases en PascalCase
        // ==========================================================
        { selector: 'typeLike', format: ['PascalCase'] },

        // Los enum members son contratos igual que las propiedades: son
        // claves de permisos GIM/ANT, valores de payload y query params que
        // incluyen guiones bajos internos y minúsculas (p. ej.
        // `Admin_Travel_TravelService`, `qr`, `url`). No se les fuerza formato.
        { selector: 'enumMember', format: null },

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
      // `publicOnly: true` evita exigir JSDoc en helpers internos. Se omite
      // `FunctionDeclaration` para no inundar de avisos las funciones de
      // utilidad heredadas; se documentan clases y métodos expuestos.
      'jsdoc/require-jsdoc': [
        'warn',
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: false,
            MethodDefinition: true,
            ClassDeclaration: true,
          },
        },
      ],

      // `checkConstructors: false`: no se exige documentar los constructores
      // de NestJS (inyección de dependencias), que solo generaban ruido.
      'jsdoc/require-param': ['warn', { checkConstructors: false }],
      // `require-param-description` no soporta `checkConstructors`, así que se
      // excluyen los constructores vía `contexts` (su `FunctionExpression`
      // tiene `parent.kind === 'constructor'`). El resto de funciones/métodos
      // sí debe describir sus @param.
      'jsdoc/require-param-description': [
        'warn',
        {
          contexts: [
            'FunctionDeclaration',
            'ArrowFunctionExpression',
            'FunctionExpression:not([parent.kind="constructor"])',
            'TSMethodSignature',
            'TSEmptyBodyFunctionExpression',
          ],
        },
      ],
      'jsdoc/require-returns': ['warn', { checkConstructors: false }],
      'jsdoc/require-description': ['warn', { checkConstructors: false }],

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
);
