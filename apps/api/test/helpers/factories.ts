export const userInput = (overrides: Partial<{ email: string; displayName: string }> = {}) => ({
  email: `user-${crypto.randomUUID()}@test.local`,
  password: 'Password123!',
  displayName: 'Test User',
  ...overrides,
});
