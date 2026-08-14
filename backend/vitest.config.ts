import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Every date calculation assumes the app runs in the user's zone; CI defaults to UTC.
    env: { TZ: 'Europe/Prague' },
  },
})
