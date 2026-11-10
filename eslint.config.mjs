// ESLint catches broken code and logic slips, not style: undefined names, unreachable
// code, impossible comparisons, missing returns, unsafe eval-like calls.
import js from '@eslint/js';
import globals from 'globals';

const bugRules = {
  'no-empty': ['error', { allowEmptyCatch: true }], // storage access may throw; ignoring it is intended
  'array-callback-return': 'error',
  'no-constant-binary-expression': 'error',
  'no-constructor-return': 'error',
  'no-promise-executor-return': 'error',
  'no-self-compare': 'error',
  'no-template-curly-in-string': 'error',
  'no-unmodified-loop-condition': 'error',
  'no-unreachable-loop': 'error',
  'no-use-before-define': ['error', { functions: false, classes: true, variables: false }],
  'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none', ignoreRestSiblings: true }],
  'require-atomic-updates': 'error',
  // Security: code-from-string execution and javascript: URLs.
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
};

export default [
  { ignores: ['node_modules/**', 'dist/**', '.dist/**', 'output/**', '.qa-output/**', 'test-results/**', 'playwright-report/**', '.wrangler/**', '.vibecode-security/**', 'src/**', 'components/**', 'lib/**'] },
  js.configs.recommended,
  { rules: bugRules },
  // The site's browser script (loaded with type="module").
  { files: ['script.js'], languageOptions: { sourceType: 'module', globals: globals.browser } },
  // The Cloudflare Worker.
  { files: ['worker.js'], languageOptions: { sourceType: 'module', globals: globals.serviceworker } },
  // Node tooling and tests; tests also run callbacks inside the page.
  { files: ['**/*.mjs', 'scripts/**/*.js'], languageOptions: { sourceType: 'module', globals: { ...globals.node } } },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } } },
  { files: ['tests/**/*.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
