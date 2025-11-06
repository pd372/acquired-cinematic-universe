import { NextResponse } from "next/server"
import { getGraphData } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    console.log("=== Graph API - Using getGraphData ===")

    // Use the centralized getGraphData function which includes episode mentions
    const graphData = await getGraphData()

    console.log(`Returning ${graphData.nodes.length} nodes and ${graphData.links.length} links`)

    // TEMPORARY: Aggressive no-cache headers for debugging
    return NextResponse.json(graphData, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
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
