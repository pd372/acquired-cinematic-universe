import { NextRequest, NextResponse } from "next/server"

interface RateLimitStore {
  count: number
  resetTime: number
}

// In-memory rate limit store (consider Redis for production with multiple instances)
const rateLimitStore = new Map<string, RateLimitStore>()

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, 60000) // Clean every minute

interface RateLimitOptions {
  interval: number // Time window in milliseconds
  maxRequests: number // Maximum requests per window
  message?: string
}

/**
 * Rate limiting middleware
 * Returns null if within limit, NextResponse if limit exceeded
 */
export function rateLimit(
  request: NextRequest,
  options: RateLimitOptions,
): NextResponse | null {
  const { interval, maxRequests, message } = options

  // Get identifier (IP address or x-forwarded-for)
  const forwarded = request.headers.get("x-forwarded-for")
  const ip = forwarded ? forwarded.split(",")[0] : request.ip ?? "unknown"

  // Create a unique key based on IP and path
  const key = `${ip}:${request.nextUrl.pathname}`

  const now = Date.now()
  const store = rateLimitStore.get(key)

  if (!store || now > store.resetTime) {
    // First request or window expired - create new window
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + interval,
    })
    return null
  }

  if (store.count >= maxRequests) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((store.resetTime - now) / 1000)
    return NextResponse.json(
      {
        error: message || "Too many requests. Please try again later.",
        retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Limit": maxRequests.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": new Date(store.resetTime).toISOString(),
        },
      },
    )
  }

  // Increment count
  store.count += 1
  rateLimitStore.set(key, store)

  return null
}

// Preset rate limit configurations
export const RATE_LIMITS = {
  // Strict limit for auth endpoints
  AUTH: {
    interval: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 attempts per 15 minutes
    message: "Too many login attempts. Please try again later.",
  },
  // Standard limit for authenticated API endpoints
  API_WRITE: {
    interval: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute
  },
  // More permissive limit for read endpoints
  API_READ: {
    interval: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
  },
  // Very strict for expensive operations
  EXPENSIVE: {
    interval: 60 * 60 * 1000, // 1 hour
    maxRequests: 10, // 10 requests per hour
    message: "This operation is rate limited. Please try again later.",
  },
} as const

/**
 * Helper to get rate limit stats for monitoring
 */
export function getRateLimitStats(): {
  totalKeys: number
  entries: Array<{ key: string; count: number; resetsAt: string }>
} {
  return {
    totalKeys: rateLimitStore.size,
    entries: Array.from(rateLimitStore.entries()).map(([key, value]) => ({
      key,
      count: value.count,
      resetsAt: new Date(value.resetTime).toISOString(),
    })),
  }
}
