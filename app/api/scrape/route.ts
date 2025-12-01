import { type NextRequest, NextResponse } from "next/server"
import { fetchEpisodesList, processEpisode } from "@/lib/transcript-processor"
import { processInParallel } from "@/lib/parallel-processor"
import { verifyAuthHeader } from "@/lib/auth"
import { clearCache } from "@/lib/cache"

// Force dynamic rendering for authenticated routes
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Check authentication
    if (!verifyAuthHeader(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = request.nextUrl.searchParams.get("url")
    const processAll = request.nextUrl.searchParams.get("all") === "true"

    // Process a single episode
    if (url) {
      console.log(`API: Processing single episode: ${url}`)
      const result = await processEpisode(url)
      console.log(`API: Episode processing result:`, result)

      // Clear the cache after successful processing
      if (result.success) {
        try {
          console.log("API: Clearing graph data cache...")
          clearCache("graph_data")
          console.log("API: Cache cleared successfully")
        } catch (cacheError) {
          console.error("API: Error clearing cache:", cacheError)
        }
      }

      return NextResponse.json(result)
    }

    // Process all episodes
    if (processAll) {
      // For batch processing, we'll need to handle the 60-second timeout
      // Start the process but return quickly with a status message

      // Fetch episode list first (this is relatively quick)
      const episodes = await fetchEpisodesList()

      // Start processing in the background without waiting for completion
      // This will continue running but might get cut off after 60 seconds
      processInParallel(
        episodes.map((ep) => ep.url),
        processEpisode,
        2, // Reduce concurrency to 2 to minimize resource usage
      )
        .then((results) => {
          // This might not complete within the function's lifetime
          console.log(`Completed processing ${results.length} episodes`)

          // Try to clear the cache after processing
          try {
            clearCache("graph_data")
          } catch (error) {
            console.error("Error clearing cache after batch processing:", error)
          }
        })
        .catch((error) => {
          console.error("Error in background processing:", error)
        })

      return NextResponse.json({
        success: true,
        message: `Started processing ${episodes.length} episodes in the background. Check logs for progress.`,
        note: "Due to serverless function timeout limits, processing may be incomplete. Consider processing episodes individually.",
      })
    }

    return NextResponse.json({ error: "Missing url or all=true parameter" }, { status: 400 })
  } catch (error) {
    console.error("Error in scrape API:", error)
    return NextResponse.json(
      { error: `Failed to process: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
