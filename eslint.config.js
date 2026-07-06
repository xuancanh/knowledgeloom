import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'knowledge', 'src/ee', 'server/src/ee'] },
  {
    // OSS code must never import extensions modules; only the designated
    // seams (main.tsx glob, AuthModule dynamic import) may load extensions/ at runtime.
    files: ['**/*.{ts,tsx}'],
    ignores: ['src/extensions/**', 'server/src/extensions/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/extensions/**'],
          message: 'OSS code must not import from extensions/ — extensions modules load via the extensions registry / AUTH_STRATEGY seams.',
        }],
      }],
    },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
