import { type NextRequest, NextResponse } from "next/server"
import { clearCache } from "@/lib/cache"

export async function POST(request: NextRequest) {
  try {
    // Check for API key or other authentication
    const authHeader = request.headers.get("authorization")
    if (!process.env.INTERNAL_API_KEY || authHeader !== `Bearer ${process.env.INTERNAL_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Clear all server-side memory cache
    clearCache()

    // Create response with comprehensive cache-busting headers
    const response = NextResponse.json({
      success: true,
      message: "All server-side cache cleared",
      timestamp: Date.now(),
      instructions: {
        clientSide: "To clear client-side cache, call clearClientCache() from useGraphData hook or clear localStorage manually",
        testing: "For testing, add ?bypass=true to /api/graph to bypass all caching"
      }
    })

    // Add comprehensive cache-busting headers
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate, proxy-revalidate")
    response.headers.set("Pragma", "no-cache")
    response.headers.set("Expires", "0")
    response.headers.set("Surrogate-Control", "no-store")

    return response
  } catch (error) {
    console.error("Error clearing all cache:", error)
    return NextResponse.json(
      { error: `Failed to clear cache: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
