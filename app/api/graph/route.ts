import { NextResponse } from 'next/server'
import { getGraphData } from '@/lib/db' // Import getGraphData from lib/db
import { getCache, setCache, cachedResponse } from '@/lib/cache' // Import cache functions

export const dynamic = 'force-dynamic' // Ensure this route is dynamic

export async function GET() {
  try {
    const cacheKey = 'full-graph-data'
    let graphData = getCache(cacheKey)

    // Check if cache should be bypassed (e.g., via a query param, though not explicitly used here)
    // const bypassCache = request.nextUrl.searchParams.get('bypass') === 'true'

    if (!graphData) { // && !bypassCache
      console.log('Cache miss for graph data. Fetching from DB...')
      graphData = await getGraphData()
      setCache(cacheKey, graphData, { ttl: 1800 }) // Cache for 30 minutes
      console.log('Graph data fetched and cached.')
    } else {
      console.log('Cache hit for graph data.')
    }

    return cachedResponse(graphData, { ttl: 1800 }) // Return with cache headers
  } catch (error: any) {
    console.error('API Error fetching graph data:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
