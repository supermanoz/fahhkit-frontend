import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default [
  {
    ignores: [
      'dist',
      'dist-app',
      'android',
      'ios',
      // Playwright's own generated output (npm run test:e2e) - the HTML
      // report bundles a minified viewer script, and test-results/ holds
      // per-run traces/screenshots/videos, neither of which is this
      // project's own source.
      'e2e-report',
      'test-results',
      'playwright-report',
    ],
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '18.3' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      ...prettier.rules,
    },
  },
  {
    files: ['vite.config.js', 'playwright.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Playwright fixtures (test.extend({ name: async (..., use) => {...} }))
    // aren't React code - eslint-plugin-react-hooks' rules-of-hooks
    // mistakes `use` (the fixture's own teardown-after-yield callback, an
    // unrelated Playwright convention) for React's own use() hook.
    files: ['e2e/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
]
