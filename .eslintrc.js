// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: ['expo', 'prettier'],
  globals: {
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
  },
  rules: {
    'no-console': 'warn',
    // Unreliable against CJS/ESM interop and some third-party packages (e.g. firebase).
    'import/named': 'off',
  },
  overrides: [
    {
      files: ['*.config.js', 'babel.config.js', 'metro.config.js', 'tailwind.config.js'],
      env: { node: true },
    },
  ],
};
