import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**', 'wailsjs/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      ...js.configs.recommended.rules,
      // TypeScript performs name resolution; existing code is being cleaned up incrementally.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'preserve-caught-error': 'off',
    },
  },
];
