import { NextResponse } from "next/server"

// LRU Cache implementation with max size
const MAX_CACHE_SIZE = 100 // Maximum number of cache entries
const cache = new Map<string, { data: any; timestamp: number; ttl?: number }>()

interface CacheOptions {
  ttl?: number // Time to live in seconds
}

/**
 * LRU eviction: when cache is full, remove oldest entry
 */
function evictOldestIfNeeded(): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) {
      cache.delete(firstKey)
    }
  }
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

  // Move to end (most recently used) for LRU
  cache.delete(key)
  cache.set(key, entry)

  return entry.data
}

export function setCache(key: string, data: any, options?: CacheOptions): void {
  // Remove if exists (to update position)
  cache.delete(key)

  // Evict oldest if at capacity
  evictOldestIfNeeded()

  // Add new entry at end
  cache.set(key, { data, timestamp: Date.now(), ttl: options?.ttl })
}

export function clearCache(key?: string): boolean {
  if (key) {
    return cache.delete(key)
  }
  return false
}

export function clearAllCache(): void {
  cache.clear()
}

export function getCacheSize(): number {
  return cache.size
}

export function getCacheStats(): { size: number; maxSize: number; keys: string[] } {
  return {
    size: cache.size,
    maxSize: MAX_CACHE_SIZE,
    keys: Array.from(cache.keys()),
  }
}

// Helper for cached responses (e.g., for Next.js API routes)
export function cachedResponse(data: any, options?: CacheOptions): Response {
  const response = NextResponse.json(data)
  if (options?.ttl) {
    response.headers.set("Cache-Control", `public, max-age=${options.ttl}, must-revalidate`)
  } else {
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate")
  }
  return response
}
