export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['api', 'web', 'shared', 'ci', 'deps', 'repo', 'docs', 'db', 'e2e'],
    ],
    'scope-empty': [0],
  },
};
