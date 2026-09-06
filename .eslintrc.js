// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  // functions/ is a separate Node.js project (its own package.json and
  // node_modules, deployed independently) — the RN/Expo rules and import
  // resolver here don't apply, and trying to lint it against this config
  // is exactly the kind of cross-project resolution mismatch that broke CI
  // once already (see the @expo/vector-icons fix).
  // public/ is copied verbatim into the web export, never touched by Metro —
  // firebase-messaging-sw.js in there is a service worker (its own global
  // scope: `self`, `importScripts`, no `window`), not app code.
  // dist/ is expo export's build output (a copy of public/ plus the
  // minified app bundle) — regenerated on every deploy, never hand-edited.
  ignorePatterns: ['functions/', 'public/', 'dist/'],
  extends: ['expo', 'prettier'],
  globals: {
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    Intl: 'readonly',
    // Browser-only, used from the web-specific paths in
    // services/notificationService.js (Web Push registration) and
    // services/pwa.js (keyboard/viewport handling).
    URLSearchParams: 'readonly',
    Notification: 'readonly',
    document: 'readonly',
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
