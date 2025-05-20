// This script triggers the scraping process via the API
// Run with: npx tsx scripts/trigger-scrape.ts [url|all]

import fetch from "node-fetch"
import dotenv from "dotenv"

// Load environment variables
dotenv.config()

async function main() {
  try {
    const apiKey = process.env.INTERNAL_API_KEY
    if (!apiKey) {
      throw new Error("INTERNAL_API_KEY environment variable is not set")
    }

    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"

    const arg = process.argv[2]
    let url = `${baseUrl}/api/scrape`

    if (arg === "all") {
      url += "?all=true"
      console.log("Triggering scrape for all episodes...")
    } else if (arg && arg.startsWith("http")) {
      url += `?url=${encodeURIComponent(arg)}`
      console.log(`Triggering scrape for episode: ${arg}`)
    } else {
      console.log("Usage: npx tsx scripts/trigger-scrape.ts [url|all]")
      console.log("  url: URL of a specific episode to scrape")
      console.log("  all: Scrape all episodes")
      process.exit(1)
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    const result = await response.json()

    if (response.ok) {
      console.log("Scrape triggered successfully!")
      console.log(JSON.stringify(result, null, 2))

      // Clear the cache after successful scrape
      console.log("Clearing graph data cache...")
      const clearCacheResponse = await fetch(`${baseUrl}/api/cache/clear?key=graph_data`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      })

      if (clearCacheResponse.ok) {
        console.log("Cache cleared successfully!")
      } else {
        console.error("Failed to clear cache:", await clearCacheResponse.text())
      }
    } else {
      console.error("Error triggering scrape:", result.error || response.statusText)
    }
  } catch (error) {
    console.error("Error:", error)
  }
}

main()
