import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'jsr:@supabase/functions-js/edge-runtime.d.ts': path.resolve(__dirname, 'supabase/functions/__mocks__/edge-runtime.ts'),
      'jsr:@supabase/supabase-js@2': path.resolve(__dirname, 'supabase/functions/__mocks__/supabase-js.ts'),
      '../generate-world/broadcast.ts': path.resolve(__dirname, 'supabase/functions/__mocks__/broadcast.ts'),
    },
  },
})
