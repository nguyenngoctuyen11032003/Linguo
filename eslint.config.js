import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'packages/shared/src/database.types.ts',
      'supabase/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'apps/web/tests/unit/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          allowExportNames: [
            'useTheme',
            'useMotionPrefs',
            'useToast',
            'useAuth',
            'useProfile',
            'resolveTheme',
            'buttonClasses',
            'inputClasses',
            'textLinkClass',
            'FormAlert',
            'AuthContext',
            'ProfileContext',
            'LearningPathsContext',
            'useLearningPaths',
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/tests/**/*.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', '**/*.config.{js,ts}', 'apps/web/tests/e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
