import * as cheerio from "cheerio"
import { OpenAI } from "openai"
import { getEpisodeByUrl, createEpisode } from "./db"
import { storeRawEntities, storeRawRelationships, type RawEntity, type RawRelationship } from "./staging-store"
import { processInParallel } from "./parallel-processor" // Import the parallel processor

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Function to fetch episode list from Acquired website
export async function fetchEpisodesList(): Promise<{ title: string; url: string }[]> {
  console.log("Fetching episodes list...")

  try {
    const response = await fetch("https://www.acquired.fm/episodes")
    if (!response.ok) {
      throw new Error(`Failed to fetch episodes list: ${response.status}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    const episodes: { title: string; url: string }[] = []

    // Find episode links - adjust selector based on actual site structure
    $(".episode-item a, .episode a, article a").each((i, el) => {
      const href = $(el).attr("href")
      if (href && href.includes("/episodes/")) {
        const title = $(el).find(".episode-title, h3").text().trim() || $(el).text().trim()
        if (title) {
          episodes.push({
            title,
            url: href.startsWith("/") ? `https://www.acquired.fm${href}` : href,
          })
        }
      }
    })

    console.log(`Found ${episodes.length} episodes`)
    return episodes
  } catch (error) {
    console.error("Error fetching episodes list:", error)
    throw error
  }
}

// Function to fetch and process a single episode
export async function processEpisode(episodeUrl: string): Promise<{
  success: boolean
  message: string
  episodeId?: string
  rawEntities?: number
  rawRelationships?: number
}> {
  console.log(`Processing episode: ${episodeUrl}`)

  try {
    // Check if episode already exists in database
    const existingEpisode = await getEpisodeByUrl(episodeUrl)

    if (existingEpisode) {
      return {
        success: true,
        message: `Episode already processed: ${existingEpisode.title}`,
        episodeId: existingEpisode.id,
      }
    }

    // Fetch episode page
    const response = await fetch(episodeUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch episode: ${response.status}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Extract episode title and published date
    const title = $(".episode-title, h1, .title").first().text().trim()
    const publishedDateStr = $(".episode-date, .published-date, .date").first().text().trim()
    const publishedAt = publishedDateStr ? new Date(publishedDateStr) : undefined

    // Try multiple selectors for transcript
    let transcriptText = ""

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

    for (const selector of possibleSelectors) {
      const text = $(selector).text().trim()
      if (text && text.length > 500) {
        // Ensure we have substantial content
        transcriptText = text
        console.log(`Found transcript using selector: ${selector}`)
        break
      }
    }

    // If still no transcript, try to find any large text block that might be the transcript
    if (!transcriptText) {
      console.log("No transcript found with standard selectors, trying to find large text blocks...")

      // Look for any div with substantial text content
      $("div, section, article").each((i, el) => {
        const text = $(el).text().trim()
        // If we find a large block of text (likely the transcript)
        if (text.length > 5000 && text.includes(".") && text.includes("?")) {
          transcriptText = text
          console.log(
            `Found potential transcript in element: ${$(el).attr("class") || $(el).attr("id") || "unnamed element"}`,
          )
          return false // break the each loop
        }
      })
    }

    // If still no transcript, try to extract from the entire page content
    if (!transcriptText) {
      console.log("Attempting to extract transcript from page body...")
      const bodyText = $("body").text().trim()

      // Remove navigation, header, footer content
      const cleanedText = bodyText
        .replace(/Menu|Navigation|Header|Footer|Copyright|All rights reserved/gi, "")
        .replace(/\s+/g, " ")
        .trim()

      if (cleanedText.length > 5000) {
        transcriptText = cleanedText
        console.log("Using cleaned body text as transcript")
      }
    }

    // Log the first 200 chars of what we found for debugging
    console.log(`Transcript preview (first 200 chars): ${transcriptText.substring(0, 200)}...`)

    if (!transcriptText || transcriptText.length < 1000) {
      return { success: false, message: `No transcript found for episode: ${title || episodeUrl}` }
    }

    // Process the transcript to extract only the relevant content
    const processedTranscript = extractRelevantTranscriptContent(transcriptText)
    console.log(
      `Processed transcript length: ${processedTranscript.length} characters (original: ${transcriptText.length})`,
    )
    console.log(`Processed transcript preview: ${processedTranscript.substring(0, 200)}...`)

    // Create episode in database (without storing the transcript)
    console.log(`Creating episode in database: ${title || `Episode from ${episodeUrl}`}`)
    const episode = await createEpisode(title || `Episode from ${episodeUrl}`, episodeUrl, publishedAt)
    console.log(`Episode created with ID: ${episode.id}`)

    // --- Batch Processing Logic ---
    const CHUNK_SIZE = 10000 // Characters per chunk
    const OVERLAP_SIZE = 500 // Overlap to maintain context
    const OPENAI_CONCURRENCY_LIMIT = 3 // Limit concurrent OpenAI calls

    let allExtractedEntities: any[] = []
    let allExtractedRelationships: any[] = []

    // Deduplication sets for entities and relationships within this processing run
    const uniqueEntities = new Map<string, any>() // Key: `${name}|${type}`
    const uniqueRelationships = new Map<string, any>() // Key: `${source}|${target}|${description}`

    const chunks: string[] = []
    for (let i = 0; i < processedTranscript.length; i += CHUNK_SIZE - OVERLAP_SIZE) {
      chunks.push(processedTranscript.substring(i, i + CHUNK_SIZE))
    }

    console.log(`Splitting transcript into ${chunks.length} chunks for parallel processing.`)

    // Process chunks in parallel using processInParallel
    const chunkResults = await processInParallel(
      chunks,
      async (chunk) => {
        return extractEntitiesAndRelationships(chunk, title || "Untitled Episode")
      },
      OPENAI_CONCURRENCY_LIMIT,
    )

    chunkResults.forEach((result) => {
      result.entities.forEach((entity) => {
        const key = `${entity.name.toLowerCase()}|${entity.type.toLowerCase()}`
        if (!uniqueEntities.has(key)) {
          uniqueEntities.set(key, entity)
        } else {
          // Optionally update description if new one is better
          const existing = uniqueEntities.get(key)
          if (
            entity.description &&
            (!existing.description || entity.description.length > existing.description.length)
          ) {
            uniqueEntities.set(key, { ...existing, description: entity.description })
          }
        }
      })

      result.relationships.forEach((rel) => {
        const key = `${rel.source.toLowerCase()}|${rel.target.toLowerCase()}|${rel.description.toLowerCase()}`
        if (!uniqueRelationships.has(key)) {
          uniqueRelationships.set(key, rel)
        }
      })
    })

    allExtractedEntities = Array.from(uniqueEntities.values())
    allExtractedRelationships = Array.from(uniqueRelationships.values())

    console.log(
      `Aggregated ${allExtractedEntities.length} unique entities and ${allExtractedRelationships.length} unique relationships from all chunks`,
    )

    // Add entity consolidation before storing
    console.log("Consolidating similar entities...")
    const consolidatedEntities = consolidateEntities(Array.from(uniqueEntities.values()))
    const consolidatedRelationships = consolidateRelationships(
      Array.from(uniqueRelationships.values()),
      consolidatedEntities,
    )

    console.log(`Consolidated from ${uniqueEntities.size} to ${consolidatedEntities.length} entities`)

    // Add luxury brand business logic
    function addLuxuryBrandConnections(
      entities: any[],
      relationships: any[],
    ): { entities: any[]; relationships: any[] } {
      const luxuryBrands = [
        "rolex",
        "ferrari",
        "louis vuitton",
        "hermès",
        "chanel",
        "gucci",
        "prada",
        "cartier",
        "tiffany",
        "bulgari",
        "patek philippe",
        "lamborghini",
        "bentley",
        "rolls-royce",
        "maserati",
        "porsche",
      ]

      const updatedEntities = [...entities]
      const updatedRelationships = [...relationships]

      // Check if we have luxury brands and ensure proper connections
      entities.forEach((entity) => {
        if (entity.type === "Company" && luxuryBrands.some((brand) => entity.name.toLowerCase().includes(brand))) {
          // Ensure Luxury Goods Industry exists
          const hasLuxuryIndustry = entities.some((e) => e.name === "Luxury Goods Industry" && e.type === "Topic")

          if (!hasLuxuryIndustry) {
            updatedEntities.push({
              name: "Luxury Goods Industry",
              type: "Topic",
              description: "Industry focused on high-end, premium consumer goods",
            })
          }

          // Ensure Branding power exists
          const hasBranding = entities.some((e) => e.name === "Branding" && e.type === "Topic")

          if (!hasBranding) {
            updatedEntities.push({
              name: "Branding",
              type: "Topic",
              description: "Hamilton Helmer's 7th Power: customer loyalty beyond utilitarian value",
            })
          }

          // Add required relationships
          const hasIndustryConnection = relationships.some(
            (r) => r.source === entity.name && r.target === "Luxury Goods Industry",
          )

          if (!hasIndustryConnection) {
            updatedRelationships.push({
              source: entity.name,
              target: "Luxury Goods Industry",
              description: "operates in the luxury goods market",
            })
          }

          const hasBrandingConnection = relationships.some((r) => r.source === entity.name && r.target === "Branding")

          if (!hasBrandingConnection) {
            updatedRelationships.push({
              source: entity.name,
              target: "Branding",
              description: "leverages brand power as competitive advantage",
            })
          }
        }
      })

      return { entities: updatedEntities, relationships: updatedRelationships }
    }

    // Apply luxury brand business logic
    const { entities: entitiesWithLuxury, relationships: relationshipsWithLuxury } = addLuxuryBrandConnections(
      consolidatedEntities,
      consolidatedRelationships,
    )

    // Update the final arrays
    const rawEntitiesToStore: RawEntity[] = entitiesWithLuxury.map((entity) => ({
      name: entity.name,
      type: entity.type,
      description: entity.description,
      episodeId: episode.id,
      episodeTitle: title || "Untitled Episode",
      extractedAt: now,
    }))

    const rawRelationshipsToStore: RawRelationship[] = relationshipsWithLuxury.map((rel) => ({
      sourceName: rel.source,
      targetName: rel.target,
      description: rel.description,
      episodeId: episode.id,
      episodeTitle: title || "Untitled Episode",
      extractedAt: now,
    }))

    // Store raw entities and relationships in staging area
    const now = new Date()

    // Store in staging area
    await storeRawEntities(rawEntitiesToStore)
    await storeRawRelationships(rawRelationshipsToStore)

    console.log(
      `Stored ${rawEntitiesToStore.length} raw entities and ${rawRelationshipsToStore.length} raw relationships in staging area`,
    )

    return {
      success: true,
      message: `Successfully processed episode: ${episode.title}`,
      episodeId: episode.id,
      rawEntities: rawEntitiesToStore.length,
      rawRelationships: rawRelationshipsToStore.length,
    }
  } catch (error) {
    console.error(`Error processing episode ${episodeUrl}:`, error)
    return { success: false, message: `Error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

// Function to extract only the relevant content from the transcript
function extractRelevantTranscriptContent(fullTranscript: string): string {
  console.log("Extracting relevant content from transcript...")

  // Convert to lowercase for case-insensitive matching
  const lowerTranscript = fullTranscript.toLowerCase()

  // Common markers that indicate the start of the actual transcript
  const startMarkers = [
    "transcript:",
    "transcript begins",
    "episode transcript",
    "begin transcript",
    "start of transcript",
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
      console.log(`Found transcript start marker: "${marker}" at position ${index}`)
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
      console.log(`Found transcript end marker: "${marker}" at position ${index}`)
      break
    }
  }

  // Extract the relevant portion
  const relevantTranscript = fullTranscript.substring(startIndex, endIndex).trim()

  // If we couldn't find markers or the extracted content is too short,
  // fall back to the original transcript
  if (relevantTranscript.length < 1000 || relevantTranscript.length < fullTranscript.length * 0.3) {
    console.log("Extracted content too short, falling back to original transcript")
    return fullTranscript
  }

  console.log(
    `Successfully extracted relevant content (${relevantTranscript.length} chars, ${Math.round((relevantTranscript.length / fullTranscript.length) * 100)}% of original)`,
  )
  return relevantTranscript
}

// Function to extract entities and relationships from transcript using OpenAI
async function extractEntitiesAndRelationships(
  transcriptChunk: string, // Renamed to transcriptChunk
  episodeTitle: string,
): Promise<{
  entities: any[]
  relationships: any[]
}> {
  try {
    // No need to truncate here, as we're already sending a chunk
    console.log(`Sending chunk (length: ${transcriptChunk.length}) to OpenAI for entity and relationship extraction`)

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // Using gpt-3.5-turbo for cost efficiency
      messages: [
        {
          role: "system",
          content: `You are an expert business strategist analyzing Acquired podcast transcripts. Acquired focuses on the stories and strategies behind great companies. 

Your task has TWO PARTS:
1. EXTRACT strategically important entities 
2. CREATE meaningful relationships between them

PART 1: ENTITY EXTRACTION

Be SELECTIVE - main focus on extracting entities central to the main company's strategic story. Entities parallel to the story on anectodes should be considered as well when they clearly relate to entities in other Acquired Episodes. Aim for 30-40 entities maximum per segment.

ENTITY TYPES (use exactly these three types):
- "Company": Only main companies being analyzed + major strategic partners/competitors/acquisitions central to the story
- "Person": Only founders, key CEOs, and individuals pivotal to the company's strategic direction  
- "Topic": Strategic concepts, industries, competitive advantages, products, technologies

STANDARDIZED TOPIC NAMES (use these EXACT names when applicable):

Industries:
- "Luxury Goods Industry"
- "Semiconductor Industry" 
- "Software Industry"
- "Social Media Industry"
- "E-commerce Industry"
- "Financial Services Industry"
- "Healthcare Industry"
- "Automotive Industry"
- "Entertainment Industry"
- "Gaming Industry"

Hamilton Helmer's 7 Powers (use EXACT names):
- "Scale Economies"
- "Network Economies" 
- "Counter-Positioning"
- "Switching Costs"
- "Branding"
- "Cornered Resource"
- "Process Power"

Strategic Concepts:
- "Vertical Integration"
- "Platform Strategy"
- "Ecosystem Strategy"
- "Innovation Strategy"
- "Acquisition Strategy"
- "Market Timing"
- "Product-Market Fit"

PART 2: RELATIONSHIP CREATION

Create meaningful connections between ALL extracted entities. Every entity must connect to at least one other entity.

MANDATORY RELATIONSHIPS:
- Every main company MUST connect to its industry: "operates in [Industry]"
- Every person MUST connect to their company: "founded" / "led as CEO" / "was key executive at"
- Luxury brands MUST connect to BOTH "Luxury Goods Industry" AND "Branding"
- Products/services MUST connect to their parent company: "developed by" / "created by"
- Strategic concepts MUST connect to relevant companies: "leveraged by" / "implemented by"

RELATIONSHIP DESCRIPTIONS:
- Use active, specific verbs: "founded", "acquired", "developed", "leveraged", "operates in"
- Keep descriptions under 10 words
- Focus on the strategic nature of the connection

NETWORK COMPLETENESS:
- Ensure every entity connects to at least one other entity
- Ensure there's a path from every entity back to a main company (directly or indirectly)
- No orphaned entities allowed

OUTPUT FORMAT:
Return a JSON object with exactly this structure:

{
  "entities": [
    {
      "name": "Exact Entity Name",
      "type": "Company|Person|Topic", 
      "description": "Single strategic sentence, 15 words max"
    }
  ],
  "relationships": [
    {
      "source": "Source Entity Name",
      "target": "Target Entity Name", 
      "description": "Active verb describing connection, under 10 words"
    }
  ]
}

EXAMPLE:
{
  "entities": [
    {
      "name": "Rolex",
      "type": "Company",
      "description": "Swiss luxury watchmaker known for precision and brand prestige"
    },
    {
      "name": "Luxury Goods Industry", 
      "type": "Topic",
      "description": "Industry focused on high-end premium consumer goods"
    },
    {
      "name": "Branding",
      "type": "Topic", 
      "description": "Hamilton Helmer's 7th Power: customer loyalty beyond utilitarian value"
    }
  ],
  "relationships": [
    {
      "source": "Rolex",
      "target": "Luxury Goods Industry",
      "description": "operates in luxury goods market"
    },
    {
      "source": "Rolex", 
      "target": "Branding",
      "description": "leverages brand power as competitive advantage"
    }
  ]
}

Remember: Be ruthlessly selective. Quality over quantity. Focus on strategic importance and the acquired universe oc characters and companies.`,
        },
        {
          role: "user",
          content: transcriptChunk, // Use the chunk here
        },
      ],
      response_format: { type: "json_object" },
    })

    const content = response.choices[0].message.content
    if (!content) {
      throw new Error("No content in OpenAI response")
    }

    console.log("Received response from OpenAI")
    console.log("Response content preview:", content.substring(0, 500) + "...")

    try {
      const parsedContent = JSON.parse(content)
      console.log("Successfully parsed OpenAI response as JSON")

      const entities = parsedContent.entities || []
      const relationships = parsedContent.relationships || []

      if (!Array.isArray(entities)) {
        console.error("OpenAI response does not contain a valid entities array:", parsedContent)
        return { entities: [], relationships: [] }
      }

      if (!Array.isArray(relationships)) {
        console.error("OpenAI response does not contain a valid relationships array:", parsedContent)
        return { entities, relationships: [] }
      }

      console.log(`Found ${entities.length} entities and ${relationships.length} relationships in OpenAI response`)
      return { entities, relationships }
    } catch (error) {
      console.error("Error parsing OpenAI response:", error)
      console.error("Raw response content:", content)
      throw new Error("Failed to parse entity and relationship extraction results")
    }
  } catch (error) {
    console.error("Error extracting entities and relationships:", error)
    throw error
  }
}

// Entity consolidation functions
function consolidateEntities(entities: any[]): any[] {
  const consolidationMap: Record<string, string> = {
    // Brand-related consolidation
    "brand management": "Branding",
    "brand power": "Branding",
    "brand positioning": "Branding",
    "brand strategy": "Branding",
    "brand building": "Branding",
    "brand equity": "Branding",

    // Scale-related consolidation
    "economies of scale": "Scale Economies",
    "scale advantages": "Scale Economies",
    "scale benefits": "Scale Economies",

    // Network-related consolidation
    "network effects": "Network Economies",
    "network advantages": "Network Economies",
    "network value": "Network Economies",

    // Industry standardization
    "luxury market": "Luxury Goods Industry",
    "luxury sector": "Luxury Goods Industry",
    "luxury business": "Luxury Goods Industry",
    "semiconductor market": "Semiconductor Industry",
    "chip industry": "Semiconductor Industry",
    "software market": "Software Industry",
    "tech industry": "Software Industry",
  }

  const consolidatedMap = new Map<string, any>()

  entities.forEach((entity) => {
    const normalizedName = entity.name.toLowerCase()
    const standardName = consolidationMap[normalizedName] || entity.name

    const key = `${standardName.toLowerCase()}|${entity.type.toLowerCase()}`

    if (!consolidatedMap.has(key)) {
      consolidatedMap.set(key, {
        ...entity,
        name: standardName,
      })
    } else {
      // Keep the better description
      const existing = consolidatedMap.get(key)
      if (entity.description && (!existing.description || entity.description.length > existing.description.length)) {
        consolidatedMap.set(key, {
          ...existing,
          description: entity.description,
        })
      }
    }
  })

  return Array.from(consolidatedMap.values())
}

function consolidateRelationships(relationships: any[], consolidatedEntities: any[]): any[] {
  const entityNameMap = new Map<string, string>()

  // Create a mapping from old names to new consolidated names
  consolidatedEntities.forEach((entity) => {
    entityNameMap.set(entity.name.toLowerCase(), entity.name)
  })

  const consolidationMap: Record<string, string> = {
    "brand management": "Branding",
    "brand power": "Branding",
    "brand positioning": "Branding",
    "brand strategy": "Branding",
    "economies of scale": "Scale Economies",
    "network effects": "Network Economies",
    "luxury market": "Luxury Goods Industry",
    "semiconductor market": "Semiconductor Industry",
  }

  return relationships
    .map((rel) => ({
      ...rel,
      source: consolidationMap[rel.source.toLowerCase()] || rel.source,
      target: consolidationMap[rel.target.toLowerCase()] || rel.target,
    }))
    .filter((rel) => {
      // Only keep relationships where both entities exist in our consolidated set
      const sourceExists = entityNameMap.has(rel.source.toLowerCase())
      const targetExists = entityNameMap.has(rel.target.toLowerCase())
      return sourceExists && targetExists
    })
}
