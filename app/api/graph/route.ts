import { type NextRequest, NextResponse } from "next/server"
import { getGraphData } from "@/lib/db"
import { getCache, setCache, cachedResponse } from "@/lib/cache"

// Cache TTL in seconds (1 hour)
const CACHE_TTL = 3600

export async function GET(request: NextRequest) {
  try {
    console.log("=== Graph API Request Started ===")
    
    // Check if cache should be bypassed
    const bypassCache = request.nextUrl.searchParams.get("bypass") === "true"
    
    if (!bypassCache) {
      // Try to get from memory cache first
      const cachedData = getCache("graph_data")
      if (cachedData) {
        console.log("Returning cached graph data")
        return cachedResponse(cachedData, { ttl: CACHE_TTL })
      }
    } else {
      console.log("Bypassing cache due to bypass=true parameter")
    }

    // Fetch graph data from database
    const graphData = await getGraphData()
    
    console.log("Raw graph data from database:", {
      nodes: graphData.nodes?.length || 0,
      links: graphData.links?.length || 0,
      sampleNode: graphData.nodes?.[0],
      sampleLink: graphData.links?.[0]
    })

    // Validate data structure
    if (!graphData || !graphData.nodes || !Array.isArray(graphData.nodes)) {
      console.error("Invalid graph data structure - missing or invalid nodes")
      return NextResponse.json({ 
        error: "Invalid graph data structure",
        debug: { graphData }
      }, { status: 500 })
    }

    if (!graphData.links || !Array.isArray(graphData.links)) {
      console.error("Invalid graph data structure - missing or invalid links")
      return NextResponse.json({ 
        error: "Invalid graph data structure",
        debug: { graphData }
      }, { status: 500 })
    }

    // Save to memory cache only if not bypassing
    if (!bypassCache) {
      setCache("graph_data", graphData, { ttl: CACHE_TTL })
    }

    console.log("=== Graph API Request Completed Successfully ===")
    
    // Return response with appropriate cache headers
    if (bypassCache) {
      // No cache headers when bypassing
      const response = NextResponse.json(graphData)
      response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate")
      response.headers.set("Pragma", "no-cache")
      response.headers.set("Expires", "0")
      return response
    } else {
      // Normal cache headers
      return cachedResponse(graphData, { ttl: CACHE_TTL })
    }
  } catch (error) {
    console.error("Error fetching graph data:", error)
    console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace')

    return NextResponse.json({ 
      error: "Failed to fetch graph data",
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
