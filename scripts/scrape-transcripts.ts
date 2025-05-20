// This is a Node.js script that can be run separately to scrape transcripts
// You would run this with: npx tsx scripts/scrape-transcripts.ts

import fetch from "node-fetch"
import * as cheerio from "cheerio"
import fs from "fs"
import path from "path"

const ACQUIRED_BASE_URL = "https://www.acquired.fm"
const EPISODES_URL = `${ACQUIRED_BASE_URL}/episodes`
const OUTPUT_DIR = path.join(process.cwd(), "data", "transcripts")

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

async function fetchEpisodesList() {
  console.log("Fetching episodes list...")
  const response = await fetch(EPISODES_URL)
  const html = await response.text()
  const $ = cheerio.load(html)

  const episodes = []

  // Find episode links - this selector might need adjustment based on the actual site structure
  $(".episode-item a").each((i, el) => {
    const href = $(el).attr("href")
    if (href && href.includes("/episodes/")) {
      const title = $(el).find(".episode-title").text().trim()
      episodes.push({
        title,
        url: href.startsWith("/") ? `${ACQUIRED_BASE_URL}${href}` : href,
      })
    }
  })

  console.log(`Found ${episodes.length} episodes`)
  return episodes
}

async function fetchTranscript(episodeUrl) {
  console.log(`Fetching transcript for ${episodeUrl}...`)
  const response = await fetch(episodeUrl)
  const html = await response.text()
  const $ = cheerio.load(html)

  // Find the transcript section - this selector might need adjustment
  const transcriptText = $(".transcript-content").text().trim()

  if (!transcriptText) {
    console.log("No transcript found for this episode")
    return null
  }

  return transcriptText
}

async function main() {
  try {
    const episodes = await fetchEpisodesList()

    for (const episode of episodes) {
      const transcript = await fetchTranscript(episode.url)

      if (transcript) {
        // Create a safe filename
        const safeTitle = episode.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()
        const filename = `${safeTitle}.txt`
        const filePath = path.join(OUTPUT_DIR, filename)

        // Save transcript to file
        fs.writeFileSync(filePath, transcript)

        // Also save episode metadata
        const metadataPath = path.join(OUTPUT_DIR, `${safeTitle}_meta.json`)
        fs.writeFileSync(
          metadataPath,
          JSON.stringify(
            {
              title: episode.title,
              url: episode.url,
              date: new Date().toISOString(),
            },
            null,
            2,
          ),
        )

        console.log(`Saved transcript for "${episode.title}"`)
      }

      // Add a delay to avoid overwhelming the server
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    console.log("All transcripts scraped successfully!")
  } catch (error) {
    console.error("Error scraping transcripts:", error)
  }
}

main()
