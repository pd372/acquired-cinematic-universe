import { unstable_cache } from 'next/cache'

const CACHE_TAGS = {
  GRAPH_DATA: 'graph-data',
  ENTITIES: 'entities',
  RELATIONSHIPS: 'relationships',
  EPISODES: 'episodes'
} as const

export function createCachedFunction<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  keyParts: string[],
  tags: string[] = [],
  revalidate?: number
) {
  return unstable_cache(fn, keyParts, {
    tags,
    revalidate
  })
}

export function getCacheKey(...parts: (string | number)[]): string {
  return parts.join(':')
}

export async function clearCache(tag: string): Promise<void> {
  const { revalidateTag } = await import('next/cache')
  revalidateTag(tag)
}

export async function clearAllCache(): Promise<void> {
  const { revalidateTag } = await import('next/cache')
  Object.values(CACHE_TAGS).forEach(tag => {
    revalidateTag(tag)
  })
}

export { CACHE_TAGS }
