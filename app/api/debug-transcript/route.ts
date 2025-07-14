import { type NextRequest, NextResponse } from "next/server"
import * as cheerio from "cheerio"

export const dynamic = "force-dynamic"

// Function to extract only the relevant content from the transcript
function extractRelevantTranscriptContent(fullTranscript: string): string {
  // Convert to lowercase for case-insensitive matching
  const lowerTranscript = fullTranscript.toLowerCase()

  // Common markers that indicate the start of the actual transcript
  const startMarkers = [
    "transcript:",
    "transcript begins",
    "episode transcript",
    "begin transcript",
    "start of transcript",
    "transcript start",
    "welcome to acquired",
    "welcome to season",
    "welcome back to acquired",
  ]

  // Common markers that indicate the end of the relevant content (carve-outs section)
  const endMarkers = [
    "carve out",
    "carveout",
    "carve-out",
    "our carve outs",
    "my carve out",
    "for carve outs",
    "that's our show",
    "that's it for this episode",
    "that's all for this episode",
    "end of episode",
    "end of transcript",
    "transcript ends",
  ]

  let startIndex = 0
  let endIndex = fullTranscript.length

  // Find the start of the actual transcript
  for (const marker of startMarkers) {
    const index = lowerTranscript.indexOf(marker)
    if (index !== -1) {
      // Find the end of the line containing the marker
      const lineEndIndex = fullTranscript.indexOf("\n", index + marker.length)
      if (lineEndIndex !== -1) {
        startIndex = lineEndIndex + 1
      } else {
        startIndex = index + marker.length
      }
      break
    }
  }

  // Find the start of the carve-outs section
  for (const marker of endMarkers) {
    const index = lowerTranscript.indexOf(marker)
    if (index !== -1 && index > startIndex) {
      // Find the start of the line containing the marker
      const lineStartIndex = fullTranscript.lastIndexOf("\n", index)
      if (lineStartIndex !== -1) {
        endIndex = lineStartIndex
      } else {
        endIndex = index
      }
      break
    }
  }

  // Extract the relevant portion
  const relevantTranscript = fullTranscript.substring(startIndex, endIndex).trim()

  // If we couldn't find markers or the extracted content is too short,
  // fall back to the original transcript
  if (relevantTranscript.length < 1000 || relevantTranscript.length < fullTranscript.length * 0.3) {
    return fullTranscript
  }

  return relevantTranscript
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Check for API key or other authentication
    const authHeader = request.headers.get("authorization")
    if (!process.env.INTERNAL_API_KEY || authHeader !== `Bearer ${process.env.INTERNAL_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = request.nextUrl.searchParams.get("url")

    if (!url) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 })
    }

    // Fetch episode page
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: `Failed to fetch episode: ${response.status}` }, { status: response.status })
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Extract episode title
    const title = $(".episode-title, h1, .title").first().text().trim()

    // Try multiple selectors for transcript
    const transcriptResults = []

    // Try different possible selectors for the transcript
    const possibleSelectors = [
      ".transcript-content",
      ".transcript",
      ".episode-transcript",
      ".content .transcript",
      "[data-transcript]",
      ".episode-content .transcript",
      ".episode-notes",
      ".notes",
      ".episode-body",
      ".episode-content",
    ]

    let fullTranscript = ""
    for (const selector of possibleSelectors) {
      const text = $(selector).text().trim()
      transcriptResults.push({
        selector,
        found: text.length > 0,
        length: text.length,
        preview: text.length > 0 ? text.substring(0, 200) + "..." : "No content",
      })

      if (text.length > fullTranscript.length) {
        fullTranscript = text
      }
    }

    // If still no transcript, try to find any large text block
    if (fullTranscript.length < 1000) {
      $("div, section, article").each((i, el) => {
        const text = $(el).text().trim()
        if (text.length > fullTranscript.length && text.includes(".") && text.includes("?")) {
          fullTranscript = text
        }
      })
    }

    // Process the transcript to extract only the relevant content
    let processedTranscript = ""
    if (fullTranscript.length > 0) {
      processedTranscript = extractRelevantTranscriptContent(fullTranscript)
    }

    // Get page structure overview
    const pageStructure = []
    $("body > *").each((i, el) => {
      const tagName = el.tagName
      const className = $(el).attr("class") || "no-class"
      const id = $(el).attr("id") || "no-id"
      const textLength = $(el).text().trim().length

      pageStructure.push({
        index: i,
        tagName,
        className,
        id,
        textLength,
        hasChildren: $(el).children().length > 0,
      })
    })

    return NextResponse.json({
      title,
      url,
      transcriptResults,
      fullTranscriptLength: fullTranscript.length,
      processedTranscriptLength: processedTranscript.length,
      processedTranscriptPreview: processedTranscript.substring(0, 500) + "...",
      fullTranscriptPreview: fullTranscript.substring(0, 500) + "...",
      pageStructure,
      htmlLength: html.length,
    })
  } catch (error) {
    console.error("Error in debug-transcript:", error)
    return NextResponse.json(
      { error: `Failed to debug transcript: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
