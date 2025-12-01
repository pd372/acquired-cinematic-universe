/**
 * Environment variable validation
 * Validates that all required environment variables are set
 */

interface EnvConfig {
  DATABASE_URL: string
  OPENAI_API_KEY: string
  ADMIN_PASSWORD: string
  VERCEL_API_TOKEN?: string
}

function validateEnv(): EnvConfig {
  const errors: string[] = []

  // Required variables
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is not set')
  }

  if (!process.env.OPENAI_API_KEY) {
    errors.push('OPENAI_API_KEY is not set')
  }

  if (!process.env.ADMIN_PASSWORD) {
    errors.push('ADMIN_PASSWORD is not set')
  } else if (process.env.ADMIN_PASSWORD === 'change-me-in-production') {
    errors.push('ADMIN_PASSWORD is still set to default value - please change it')
  }

  if (errors.length > 0) {
    const errorList = errors.map(e => `  - ${e}`).join('\n')
    throw new Error(`Environment validation failed:\n${errorList}`)
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD!,
    VERCEL_API_TOKEN: process.env.VERCEL_API_TOKEN,
  }
}

// Validate on module load (only in Node.js environment, not in browser)
export const env = typeof window === 'undefined' ? validateEnv() : {} as EnvConfig
