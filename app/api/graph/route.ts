import { type NextRequest, NextResponse } from "next/server"
import { getGraphData } from "@/lib/db"
import { getCache, setCache, cachedResponse } from "@/lib/cache"

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 3600

// Remove ALL config exports including revalidate

export async function GET(request: NextRequest) {
  try {
    // Try to get data from memory cache first
    const cacheKey = "graph_data"
    const cachedData = getCache(cacheKey)

    if (cachedData) {
      console.log("Serving graph data from memory cache")
      return cachedResponse(cachedData, { ttl: CACHE_TTL })
    }

    console.log("Cache miss, fetching graph data from database")

    // Fetch graph data from database
    const graphData = await getGraphData()

    // Save to memory cache
    setCache(cacheKey, graphData, { ttl: CACHE_TTL })

    // Return response with cache headers
    return cachedResponse(graphData, { ttl: CACHE_TTL })
  } catch (error) {
    console.error("Error fetching graph data:", error)

    // Try to serve stale cache in case of error
    const staleData = getCache("graph_data")
    if (staleData) {
      console.log("Serving stale graph data after error")
      return cachedResponse(staleData, { ttl: 60 }) // Short TTL for stale data
    }

    return NextResponse.json({ error: "Failed to fetch graph data" }, { status: 500 })
  }
}
