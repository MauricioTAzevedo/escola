import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.vite/**', '**/*.config.*'],
  },
  {
    rules: {
      // Pre-existing codebase style: explicit `any` used in helpers/routes.
      '@typescript-eslint/no-explicit-any': 'off',
      // New rule (typescript-eslint 8.65+); error rethrow style predates it.
      'preserve-caught-error': 'off',
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Pre-existing modal sync-on-open patterns (React 19 rule).
      'react-hooks/set-state-in-effect': 'off',
    },
  }
);
