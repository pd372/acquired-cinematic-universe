// In-memory cache for server-side data
const cache = new Map<string, { data: any; timestamp: number; ttl?: number }>()

interface CacheOptions {
  ttl?: number // Time to live in seconds
}

export function getCache(key: string): any | null {
  const entry = cache.get(key)
  if (!entry) {
    return null
  }

  // Check if expired
  if (entry.ttl && Date.now() - entry.timestamp > entry.ttl * 1000) {
    cache.delete(key)
    return null
  }

  return entry.data
}

export function setCache(key: string, data: any, options?: CacheOptions): void {
  cache.set(key, { data, timestamp: Date.now(), ttl: options?.ttl })
}

export function clearCache(key: string): boolean {
  return cache.delete(key)
}

export function clearAllCache(): void {
  cache.clear()
}

// Helper for cached responses (e.g., for Next.js API routes)
export function cachedResponse(data: any, options?: CacheOptions): Response {
  const response = NextResponse.json(data)
  if (options?.ttl) {
    response.headers.set('Cache-Control', `public, max-age=${options.ttl}, must-revalidate`)
  } else {
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  }
  return response
}
