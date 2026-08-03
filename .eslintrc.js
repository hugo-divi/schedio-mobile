// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  // functions/ is a separate Node.js project (its own package.json and
  // node_modules, deployed independently) — the RN/Expo rules and import
  // resolver here don't apply, and trying to lint it against this config
  // is exactly the kind of cross-project resolution mismatch that broke CI
  // once already (see the @expo/vector-icons fix).
  ignorePatterns: ['functions/'],
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
