import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'server/dist', 'knowledge', 'src/ee', 'server/src/ee'] },
  {
    // OSS code must never import enterprise modules; only the designated
    // seams (main.tsx glob, AuthModule dynamic import) may load ee/ at runtime.
    files: ['**/*.{ts,tsx}'],
    ignores: ['src/ee/**', 'server/src/ee/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/ee/**'],
          message: 'OSS code must not import from ee/ — enterprise modules load via the EE registry / AUTH_STRATEGY seams.',
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
      // Codebase style: `any` is accepted at HTTP/AI boundaries (controllers,
      // provider payloads). Keep it visible as a warning, not a CI failure.
      '@typescript-eslint/no-explicit-any': 'warn',
      // React-compiler lints flag long-standing patterns app-wide (setState in
      // mount effects, ref reads in render). Track as warnings until the
      // components are migrated deliberately.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      // Intentionally-unused args/captures use a leading underscore.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
);
