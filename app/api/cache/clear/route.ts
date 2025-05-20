import { type NextRequest, NextResponse } from "next/server"
import { clearCache } from "@/lib/cache"

export async function POST(request: NextRequest) {
  try {
    // Check for API key or other authentication
    const authHeader = request.headers.get("authorization")
    if (!process.env.INTERNAL_API_KEY || authHeader !== `Bearer ${process.env.INTERNAL_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get specific cache key from query params
    const key = request.nextUrl.searchParams.get("key")

    // Clear cache
    clearCache(key || undefined)

    return NextResponse.json({
      success: true,
      message: key ? `Cache cleared for key: ${key}` : "All cache cleared",
    })
  } catch (error) {
    console.error("Error clearing cache:", error)
    return NextResponse.json(
      { error: `Failed to clear cache: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
