/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// getViteConfig: .astro components can be rendered in unit tests (astro/container)
export default getViteConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
