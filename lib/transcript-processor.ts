import * as cheerio from "cheerio"
import { OpenAI } from "openai"
import { getEpisodeByUrl, createEpisode } from "./db"
import { storeRawEntities, storeRawRelationships, type RawEntity, type RawRelationship } from "./staging-store"
import { processInParallel } from "./parallel-processor" // Import the parallel processor

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Retry utility with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  initialDelay = 1000,
): Promise<T> {
  let lastError: any

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error

      // Check if it's a rate limit error
      const isRateLimit = error?.status === 429 || error?.code === 'rate_limit_exceeded'

      if (!isRateLimit || attempt === maxRetries) {
        throw error
      }

      // Calculate delay with exponential backoff
      const delay = initialDelay * Math.pow(2, attempt)
      console.log(`⏳ Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`)

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

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
        rawEntities: 0,
        rawRelationships: 0,
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
      ".transcript-container",
      ".rich-text-block-6",
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

    // --- CROSS-CHUNK ENTITY CONTEXT ---
    // First, get a high-level overview of the entire episode to establish main entities
    const episodeOverview = await extractEpisodeOverview(processedTranscript, title || "Untitled Episode")
    console.log(
      `Episode overview extracted: ${episodeOverview.mainCompanies.length} main companies, ${episodeOverview.keyTopics.length} key topics`,
    )

    // --- Batch Processing Logic ---
    const CHUNK_SIZE = 15000 // Increased chunk size to reduce total chunks
    const OVERLAP_SIZE = 1000 // Increased overlap for better context
    const OPENAI_CONCURRENCY_LIMIT = 3 // Limit concurrent OpenAI calls

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
        return extractEntitiesAndRelationships(chunk, title || "Untitled Episode", episodeOverview, episode.id)
      },
      OPENAI_CONCURRENCY_LIMIT,
    )

    chunkResults.forEach((result) => {
      result.entities.forEach((entity) => {
        // STRICT TYPE VALIDATION - Only Person and Company
        if (!["Company", "Person"].includes(entity.type)) {
          console.warn(`Rejecting entity with invalid type: ${entity.name} (${entity.type})`)
          return
        }

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

    const allExtractedEntities = Array.from(uniqueEntities.values())
    const allExtractedRelationships = Array.from(uniqueRelationships.values())

    console.log(
      `Aggregated ${allExtractedEntities.length} unique entities and ${allExtractedRelationships.length} unique relationships from all chunks`,
    )

    // Add cross-chunk relationships based on episode overview
    const crossChunkRelationships = createCrossChunkRelationships(allExtractedEntities, episodeOverview)
    const allRelationships = [...allExtractedRelationships, ...crossChunkRelationships]

    console.log(`Added ${crossChunkRelationships.length} cross-chunk relationships`)

    // Add entity consolidation before storing
    console.log("Consolidating similar entities...")
    const consolidatedEntities = consolidateEntities(allExtractedEntities)
    const consolidatedRelationships = consolidateRelationships(allRelationships, consolidatedEntities)

    console.log(`Consolidated from ${allExtractedEntities.length} to ${consolidatedEntities.length} entities`)

    // Use consolidated entities and relationships directly
    const deduplicatedEntities = consolidatedEntities
    const episodeCentricRelationships = consolidatedRelationships

    // FINAL FILTERING: Keep only the most strategic entities
    const strategicEntities = filterStrategicEntities(deduplicatedEntities, title || "Untitled Episode")
    const filteredRelationships = episodeCentricRelationships.filter((rel) => {
      const sourceExists = strategicEntities.some((e) => e.name === rel.source)
      const targetExists = strategicEntities.some((e) => e.name === rel.target)
      return sourceExists && targetExists
    })

    console.log(`Final filtering: ${deduplicatedEntities.length} → ${strategicEntities.length} entities`)

    // Declare 'now' before using it
    const now = new Date()

    // Update the final arrays
    const rawEntitiesToStore: RawEntity[] = strategicEntities.map((entity) => ({
      name: entity.name,
      type: entity.type,
      description: entity.description,
      episodeId: episode.id,
      episodeTitle: title || "Untitled Episode",
      extractedAt: now,
    }))

    const rawRelationshipsToStore: RawRelationship[] = filteredRelationships.map((rel) => ({
      sourceName: rel.source,
      targetName: rel.target,
      description: rel.description,
      episodeId: episode.id,
      episodeTitle: title || "Untitled Episode",
      extractedAt: now,
    }))

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


// NEW: Function to extract episode overview for cross-chunk context
async function extractEpisodeOverview(
  transcript: string,
  episodeTitle: string,
): Promise<{
  mainCompanies: string[]
  keyTopics: string[]
  sevenPowers: string[]
  industry: string
}> {
  try {
    // Take a sample from the beginning, middle, and end of the transcript
    const sampleSize = 3000
    const beginning = transcript.substring(0, sampleSize)
    const middle = transcript.substring(
      Math.floor(transcript.length / 2) - sampleSize / 2,
      Math.floor(transcript.length / 2) + sampleSize / 2,
    )
    const end = transcript.substring(transcript.length - sampleSize)
    const sample = `${beginning}\n\n[MIDDLE SECTION]\n${middle}\n\n[END SECTION]\n${end}`

    const response = await retryWithBackoff(() => openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `Extract the high-level overview of this Acquired podcast episode.

EPISODE TITLE: "${episodeTitle}"

Identify:
1. Main companies (1-3 companies that are the primary focus)
2. Key strategic topics and concepts discussed
3. Any of Hamilton Helmer's 7 Powers mentioned: Scale Economies, Network Economies, Counter-Positioning, Switching Costs, Branding, Cornered Resource, Process Power
4. The primary industry being discussed

Return JSON:
{
  "mainCompanies": ["Company1", "Company2"],
  "keyTopics": ["Topic1", "Topic2", "Topic3"],
  "sevenPowers": ["Branding", "Scale Economies"],
  "industry": "Industry Name"
}`,
        },
        {
          role: "user",
          content: sample,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }))

    const content = response.choices[0].message.content
    if (!content) {
      throw new Error("No content in episode overview response")
    }

    const overview = JSON.parse(content)
    return {
      mainCompanies: overview.mainCompanies || [],
      keyTopics: overview.keyTopics || [],
      sevenPowers: overview.sevenPowers || [],
      industry: overview.industry || "Unknown Industry",
    }
  } catch (error) {
    console.error("Error extracting episode overview:", error)
    return {
      mainCompanies: [],
      keyTopics: [],
      sevenPowers: [],
      industry: "Unknown Industry",
    }
  }
}

// NEW: Function to create cross-chunk relationships
function createCrossChunkRelationships(entities: any[], overview: any): any[] {
  const relationships: any[] = []

  // Connect all main companies to the industry
  overview.mainCompanies.forEach((company: string) => {
    const companyEntity = entities.find(
      (e) => e.type === "Company" && e.name.toLowerCase().includes(company.toLowerCase()),
    )
    if (companyEntity && overview.industry) {
      relationships.push({
        source: companyEntity.name,
        target: overview.industry,
        description: "operates in this industry",
      })
    }
  })

  // Connect main companies to identified 7 Powers
  overview.sevenPowers.forEach((power: string) => {
    const powerEntity = entities.find((e) => e.type === "Topic" && e.name.toLowerCase().includes(power.toLowerCase()))
    if (powerEntity) {
      overview.mainCompanies.forEach((company: string) => {
        const companyEntity = entities.find(
          (e) => e.type === "Company" && e.name.toLowerCase().includes(company.toLowerCase()),
        )
        if (companyEntity) {
          relationships.push({
            source: companyEntity.name,
            target: powerEntity.name,
            description: "leverages this strategic power",
          })
        }
      })
    }
  })

  // Connect key topics to main companies
  overview.keyTopics.forEach((topic: string) => {
    const topicEntity = entities.find((e) => e.type === "Topic" && e.name.toLowerCase().includes(topic.toLowerCase()))
    if (topicEntity) {
      overview.mainCompanies.forEach((company: string) => {
        const companyEntity = entities.find(
          (e) => e.type === "Company" && e.name.toLowerCase().includes(company.toLowerCase()),
        )
        if (companyEntity) {
          relationships.push({
            source: companyEntity.name,
            target: topicEntity.name,
            description: "strategically related to",
          })
        }
      })
    }
  })

  return relationships
}

// Function to filter entities to keep only the most strategic ones
function filterStrategicEntities(entities: any[], episodeTitle: string): any[] {
  // Always keep these strategic entity types
  const alwaysKeep = entities.filter((entity) => {
    const name = entity.name.toLowerCase()

    // Always keep the main company (likely in episode title)
    const titleWords = episodeTitle.toLowerCase().split(/\s+/)
    if (titleWords.some((word) => name.includes(word) && word.length > 3)) return true

    // Always keep major companies by name recognition
    const majorCompanies = ["apple", "microsoft", "amazon", "google", "facebook", "meta", "tesla", "netflix", "rolex", "lvmh", "hermès", "disney", "nike"]
    if (entity.type === "Company" && majorCompanies.some(company => name.includes(company))) return true

    return false
  })

  // Score remaining entities by strategic importance
  const scoredEntities = entities
    .filter((entity) => !alwaysKeep.some((keep) => keep.name === entity.name))
    .map((entity) => ({
      ...entity,
      score: calculateStrategicScore(entity, episodeTitle),
    }))
    .sort((a, b) => b.score - a.score)

  // Take top strategic entities to reach target of ~30 total
  const targetCount = Math.max(30 - alwaysKeep.length, 10)
  const topStrategic = scoredEntities.slice(0, targetCount)

  console.log(
    `Strategic filtering: ${alwaysKeep.length} always keep + ${topStrategic.length} top strategic = ${alwaysKeep.length + topStrategic.length} total`,
  )

  return [...alwaysKeep, ...topStrategic]
}

// Function to calculate strategic importance score
function calculateStrategicScore(entity: any, episodeTitle: string): number {
  let score = 0
  const name = entity.name.toLowerCase()
  const description = (entity.description || "").toLowerCase()

  // Higher score for companies (main focus of Acquired)
  if (entity.type === "Company") {
    score += 10
    // Bonus for well-known companies
    const majorCompanies = ["apple", "microsoft", "amazon", "google", "facebook", "meta", "tesla", "netflix", "rolex", "lvmh", "hermès", "disney", "nike"]
    if (majorCompanies.some(company => name.includes(company))) score += 5
  }

  // Higher score for key people (founders, CEOs)
  if (entity.type === "Person") {
    if (description.includes("founder") || description.includes("ceo") || description.includes("chairman")) score += 8
    else score += 5
  }

  // Bonus for entities mentioned in episode title
  const titleWords = episodeTitle.toLowerCase().split(/\s+/)
  if (titleWords.some((word) => name.includes(word) && word.length > 3)) {
    score += 5
  }

  return score
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
  transcriptChunk: string,
  episodeTitle: string,
  episodeOverview: any,
  episodeId: string,
): Promise<{
  entities: any[]
  relationships: any[]
}> {
  try {
    console.log(`Sending chunk (length: ${transcriptChunk.length}) to OpenAI for entity and relationship extraction`)

    const response = await retryWithBackoff(() => openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are analyzing a chunk from an Acquired podcast episode about strategic business analysis.

EPISODE CONTEXT:
- Title: "${episodeTitle}"
- Main Companies: ${episodeOverview.mainCompanies.join(", ")}
- Industry: ${episodeOverview.industry}
- Key Topics: ${episodeOverview.keyTopics.join(", ")}

FOCUS: Extract companies and people discussed in this business strategy episode.

TASK: Extract around 5 strategically important entities from this chunk and create relationships between them.

STEP 1: EXTRACT ENTITIES
Use ONLY these 2 types:
- "Company": Business organizations (Apple, Microsoft, Rolex, etc.)
- "Person": Individual people (founders, CEOs, key executives, investors)

STEP 2: CATEGORIZE INTO ONE OF THE 2 BUCKETS
- Company: Apple, Microsoft, Rolex, LVMH (business organizations)
- Person: Steve Jobs, Tim Cook, Bernard Arnault, Morris Chang (individuals)

STEP 3: WRITE DESCRIPTIONS
Each entity needs a brief strategic description (1-2 sentences max).

STEP 4: CREATE RELATIONSHIPS
Connect entities with meaningful relationships. Focus on business relationships such as:
- Person founding/leading Company
- Company acquiring/investing in Company  
- Person working at Company
- Company competing with Company
- Person investing in Company

STEP 5: ENSURE CONNECTIVITY
Every entity should have meaningful business connections to other entities in the network. Avoid isolated nodes.

STEP 6: JSON OUTPUT
Return this EXACT structure:

{
  "entities": [
    {
      "name": "Exact Entity Name",
      "type": "Company|Person",
      "description": "Strategic description in 1-2 sentences"
    }
  ],
  "relationships": [
    {
      "source": "Source Entity Name",
      "target": "Target Entity Name", 
      "description": "How they connect (active verb, under 10 words)"
    }
  ]
}

EXAMPLES:
- "Apple" = Company (business organization)
- "Tim Cook" = Person (individual)
- "Rolex" = Company (business organization)
- "Bernard Arnault" = Person (individual)

Be selective - focus on entities central to the strategic business story being told in this chunk.`,
        },
        {
          role: "user",
          content: transcriptChunk,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }))

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
    // Company name standardization
    "apple inc": "Apple",
    "apple computer": "Apple", 
    "microsoft corporation": "Microsoft",
    "alphabet inc": "Google",
    "meta platforms": "Meta",
    "facebook inc": "Meta",
    "tesla inc": "Tesla",
    "tesla motors": "Tesla",
    "lvmh moet hennessy louis vuitton": "LVMH",
    
    // Person name standardization
    "steve jobs": "Steve Jobs",
    "tim cook": "Tim Cook", 
    "bernard arnault": "Bernard Arnault",
    "elon musk": "Elon Musk",
    "mark zuckerberg": "Mark Zuckerberg",
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
    // Company name standardization  
    "apple inc": "Apple",
    "apple computer": "Apple", 
    "microsoft corporation": "Microsoft",
    "alphabet inc": "Google",
    "meta platforms": "Meta",
    "facebook inc": "Meta",
    "tesla inc": "Tesla",
    "tesla motors": "Tesla",
    "lvmh moet hennessy louis vuitton": "LVMH",
    
    // Person name standardization
    "steve jobs": "Steve Jobs",
    "tim cook": "Tim Cook", 
    "bernard arnault": "Bernard Arnault",
    "elon musk": "Elon Musk",
    "mark zuckerberg": "Mark Zuckerberg",
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
