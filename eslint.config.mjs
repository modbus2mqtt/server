import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import jest from 'eslint-plugin-jest'
import prettierPlugin from 'eslint-plugin-prettier'

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: ['dist/**'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      jest,
      prettier: prettierPlugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: 'module',
        project: ['tsconfig.eslint.json'],
      },
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
        test: 'readonly',
      },
    },
    rules: {
      'prettier/prettier': 'error',
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: ['tsconfig.eslint.json', 'tsconfig.angular.json'],
        },
      },
    },
  },
  {
    ignores: ['*.js', '*.mjs'],
  },
]
