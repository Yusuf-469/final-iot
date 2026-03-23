module.exports = [
  {
    ignores: [
      'node_modules/**',
      'package-lock.json',
      '.git/**',
      'logs/**',
      'hardware/**'
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'commonjs'
    },
    rules: {
      'semi': ['error', 'always'],
      'quotes': ['error', 'single'],
      'no-unused-vars': ['warn'],
      'no-console': ['off'],
      'no-var': ['error'],
      'prefer-const': ['error'],
      'eqeqeq': ['error', 'smart']
    }
  }
];