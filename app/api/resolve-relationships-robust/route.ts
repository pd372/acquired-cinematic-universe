import { type NextRequest, NextResponse } from "next/server"
import { resolveRelationshipsRobust } from "@/lib/robust-relationship-resolver"
import { getStagingStats } from "@/lib/staging-store"

export async function POST(request: NextRequest) {
  try {
    // Check for API key
    const authHeader = request.headers.get("authorization")
    if (!process.env.INTERNAL_API_KEY || authHeader !== `Bearer ${process.env.INTERNAL_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { batchSize } = await request.json()

    console.log("Starting robust relationship resolution...")
    const result = await resolveRelationshipsRobust(batchSize || 100)

    // Get updated stats
    const stats = await getStagingStats()

    return NextResponse.json({
      success: true,
      result,
      stats,
      message: `Robust resolution: ${result.created} created, ${result.skipped} skipped, ${result.errors} errors`,
      successRate: `${((result.created / (result.created + result.skipped)) * 100).toFixed(1)}%`,
    })
  } catch (error) {
    console.error("Error in robust relationship resolution:", error)
    return NextResponse.json({ error: "Failed to resolve relationships" }, { status: 500 })
  }
}
