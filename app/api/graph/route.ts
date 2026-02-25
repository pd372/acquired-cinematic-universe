import { NextRequest, NextResponse } from "next/server"
import { getGraphData } from "@/lib/db"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// Allow caching for this route
export const dynamic = "force-dynamic"
export const revalidate = 300 // Revalidate every 5 minutes

export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = rateLimit(request, RATE_LIMITS.API_READ)
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  try {
    // Use the centralized getGraphData function which includes episode mentions
    const graphData = await getGraphData()

    // Cache with stale-while-revalidate pattern
    return NextResponse.json(graphData, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to fetch graph data",
        nodes: [],
        links: [],
      },
      { status: 500 },
    )
  }
}
