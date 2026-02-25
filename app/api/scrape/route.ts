import { type NextRequest, NextResponse } from "next/server"
import { fetchEpisodesList, processEpisode } from "@/lib/transcript-processor"
import { processInParallel } from "@/lib/parallel-processor"
import { verifyAuthAndCSRF } from "@/lib/session"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { clearCache } from "@/lib/cache"

// Force dynamic rendering for authenticated routes
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Apply rate limiting (expensive operation)
  const rateLimitResponse = rateLimit(request, RATE_LIMITS.EXPENSIVE)
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  // Check authentication and CSRF
  const session = verifyAuthAndCSRF(request)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const url = request.nextUrl.searchParams.get("url")
    const processAll = request.nextUrl.searchParams.get("all") === "true"

    // Process a single episode
    if (url) {
      const result = await processEpisode(url)

      // Clear the cache after successful processing
      if (result.success) {
        try {
          clearCache("graph_data")
        } catch (cacheError) {
          // Silent cache clear failure
        }
      }

      return NextResponse.json(result)
    }

    // Process all episodes
    if (processAll) {
      // Fetch episode list first (this is relatively quick)
      const episodes = await fetchEpisodesList()

      // Start processing in the background without waiting for completion
      processInParallel(
        episodes.map((ep) => ep.url),
        processEpisode,
        2, // Reduce concurrency to 2 to minimize resource usage
      )
        .then(() => {
          try {
            clearCache("graph_data")
          } catch (error) {
            // Silent cache clear failure
          }
        })
        .catch(() => {
          // Background processing error - logged internally
        })

      return NextResponse.json({
        success: true,
        message: `Started processing ${episodes.length} episodes in the background.`,
        note: "Due to serverless function timeout limits, processing may be incomplete. Consider processing episodes individually.",
      })
    }

    return NextResponse.json({ error: "Missing url or all=true parameter" }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to process: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 },
    )
  }
}
