import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'apps/web/public/mediapipe/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Camadas do site (docs/frontend/arquitetura.md): shared não conhece ninguém; uma funcionalidade
  // não importa o app. Testes que montam o site inteiro ficam em app/.
  {
    files: ['apps/web/src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/**', '**/app/**'],
              message: 'shared/ não importa de features/ nem de app/ (é a base de todos).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/app/**'],
              message: 'features/ não importa de app/; o que é comum vai para shared/.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
