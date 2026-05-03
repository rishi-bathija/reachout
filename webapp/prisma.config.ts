import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Use direct DB for migrate/introspect
    url: env('DIRECT_URL'),
  },
})
