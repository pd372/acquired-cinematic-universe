import { NextResponse } from "next/server"
import { getGraphData } from "@/lib/db"

// Allow caching for this route
export const dynamic = "force-dynamic"
export const revalidate = 300 // Revalidate every 5 minutes

export async function GET() {
  try {
    console.log("=== Graph API - Using getGraphData ===")

    // Use the centralized getGraphData function which includes episode mentions
    const graphData = await getGraphData()

    console.log(`Returning ${graphData.nodes.length} nodes and ${graphData.links.length} links`)

    // Cache with stale-while-revalidate pattern
    // - Cache for 5 minutes (s-maxage=300)
    // - Allow serving stale content for 10 minutes while revalidating (stale-while-revalidate=600)
    return NextResponse.json(graphData, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      }
    })
  } catch (error: any) {
    console.error("Graph API Error:", error)
    return NextResponse.json(
      {
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        nodes: [],
        links: [],
      },
      { status: 500 },
    )
  }
}
