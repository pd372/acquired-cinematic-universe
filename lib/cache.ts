import { NextResponse } from "next/server"

// Memory cache for server-side
const memoryCache = new Map<string, { data: any; expiresAt: number | null }>()

interface CacheOptions {
  ttl?: number // Time to live in seconds
}

/**
 * Get data from cache
 * @param key Cache key
 * @returns Cached data or null if not found or expired
 */
export function getCache<T>(key: string): T | null {
  try {
    const cacheData = memoryCache.get(key)

    if (!cacheData) {
      return null
    }

    // Check if cache is expired
    if (cacheData.expiresAt && Date.now() > cacheData.expiresAt) {
      memoryCache.delete(key)
      return null
    }

    return cacheData.data
  } catch (error) {
    console.error(`Error reading cache for key ${key}:`, error)
    return null
  }
}

/**
 * Set data in cache
 * @param key Cache key
 * @param data Data to cache
 * @param options Cache options
 */
export function setCache<T>(key: string, data: T, options: CacheOptions = {}): void {
  try {
    const cacheData = {
      data,
      expiresAt: options.ttl ? Date.now() + options.ttl * 1000 : null,
    }

    memoryCache.set(key, cacheData)
  } catch (error) {
    console.error(`Error writing cache for key ${key}:`, error)
  }
}

/**
 * Create a cached response with proper cache headers
 * @param data Response data
 * @param options Cache options
 * @returns NextResponse with cache headers
 */
export function cachedResponse(data: any, options: CacheOptions = {}): NextResponse {
  const response = NextResponse.json(data)

  // Set cache control headers
  const maxAge = options.ttl || 3600 // Default to 1 hour
  const staleWhileRevalidate = maxAge * 2

  response.headers.set("Cache-Control", `public, s-maxage=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`)

  return response
}

/**
 * Clear all cache or a specific key
 * @param key Optional specific key to clear
 */
export function clearCache(key?: string): void {
  if (key) {
    memoryCache.delete(key)
  } else {
    memoryCache.clear()
  }
}
