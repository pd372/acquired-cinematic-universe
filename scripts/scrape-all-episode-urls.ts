import * as cheerio from "cheerio"
import * as fs from "fs"
import * as path from "path"

interface Episode {
  title: string
  url: string
}

async function scrapeEpisodeUrlsFromPage(pageNumber: number): Promise<Episode[]> {
  const url = `https://www.acquired.fm/episodes?39efee08_page=${pageNumber}`
  console.log(`📄 Scraping page ${pageNumber}: ${url}`)

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    const episodes: Episode[] = []

    // Find all episode links
    $("a[href*='/episodes/']").each((i, el) => {
      const href = $(el).attr("href")
      if (href && href.includes("/episodes/") && !href.endsWith("/episodes")) {
        const title = $(el).text().trim()
        const fullUrl = href.startsWith("/") ? `https://www.acquired.fm${href}` : href

        // Only add if we have a title and it's not a duplicate
        if (title && !episodes.some((e) => e.url === fullUrl)) {
          episodes.push({ title, url: fullUrl })
        }
      }
    })

    console.log(`   ✓ Found ${episodes.length} episodes on page ${pageNumber}`)
    return episodes
  } catch (error: any) {
    console.error(`   ✗ Error scraping page ${pageNumber}:`, error.message)
    return []
  }
}

async function scrapeAllPages(totalPages: number): Promise<Episode[]> {
  console.log(`🚀 Scraping ${totalPages} pages from acquired.fm\n`)

  const allEpisodes: Episode[] = []
  const seenUrls = new Set<string>()

  for (let page = 1; page <= totalPages; page++) {
    const episodes = await scrapeEpisodeUrlsFromPage(page)

    // Add unique episodes
    for (const episode of episodes) {
      if (!seenUrls.has(episode.url)) {
        seenUrls.add(episode.url)
        allEpisodes.push(episode)
      }
    }

    // Brief pause between requests to be nice to their server
    if (page < totalPages) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  return allEpisodes
}

async function main() {
  const TOTAL_PAGES = 21

  console.log("=" .repeat(80))
  console.log("Acquired Episode URL Scraper")
  console.log("=" .repeat(80))
  console.log()

  // Scrape all pages
  const episodes = await scrapeAllPages(TOTAL_PAGES)

  console.log()
  console.log("=" .repeat(80))
  console.log(`✅ Scraping complete!`)
  console.log(`   Total unique episodes found: ${episodes.length}`)
  console.log("=" .repeat(80))
  console.log()

  // Save to JSON file
  const outputPath = path.join(process.cwd(), "data", "episode-urls.json")
  const dataDir = path.join(process.cwd(), "data")

  // Create data directory if it doesn't exist
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  fs.writeFileSync(outputPath, JSON.stringify(episodes, null, 2))
  console.log(`💾 Saved episode URLs to: ${outputPath}`)

  // Also save as simple text file (one URL per line)
  const txtOutputPath = path.join(process.cwd(), "data", "episode-urls.txt")
  fs.writeFileSync(txtOutputPath, episodes.map((e) => e.url).join("\n"))
  console.log(`💾 Saved URLs (text format) to: ${txtOutputPath}`)

  // Show sample
  console.log()
  console.log("📋 First 10 episodes:")
  episodes.slice(0, 10).forEach((ep, i) => {
    console.log(`   ${i + 1}. ${ep.title}`)
    console.log(`      ${ep.url}`)
  })

  console.log()
  console.log("📋 Last 10 episodes:")
  episodes.slice(-10).forEach((ep, i) => {
    console.log(`   ${episodes.length - 9 + i}. ${ep.title}`)
    console.log(`      ${ep.url}`)
  })
}

main()
