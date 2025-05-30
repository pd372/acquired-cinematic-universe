import * as cheerio from "cheerio"
import { OpenAI } from "openai"
import { getEpisodeByUrl, createEpisode } from "./db"
import { storeRawEntities, storeRawRelationships, type RawEntity, type RawRelationship } from "./staging-store"

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

    // Extract raw entities and relationships from transcript
    console.log("Extracting raw entities and relationships from processed transcript...")
    const { entities, relationships } = await extractEntitiesAndRelationships(
      processedTranscript,
      title || "Untitled Episode",
    )
    console.log(
      `Extracted ${entities.length} raw entities and ${relationships.length} raw relationships from transcript`,
    )

    // Store raw entities and relationships in staging area
    const now = new Date()

    const rawEntities: RawEntity[] = entities.map((entity) => ({
      name: entity.name,
      type: entity.type,
      description: entity.description,
      episodeId: episode.id,
      episodeTitle: title || "Untitled Episode",
      extractedAt: now,
    }))

    const rawRelationships: RawRelationship[] = relationships.map((rel) => ({
      sourceName: rel.source,
      targetName: rel.target,
      description: rel.description,
      episodeId: episode.id,
      episodeTitle: title || "Untitled Episode",
      extractedAt: now,
    }))

    // Store in staging area
    await storeRawEntities(rawEntities)
    await storeRawRelationships(rawRelationships)

    console.log(
      `Stored ${rawEntities.length} raw entities and ${rawRelationships.length} raw relationships in staging area`,
    )

    return {
      success: true,
      message: `Successfully processed episode: ${episode.title}`,
      episodeId: episode.id,
      rawEntities: rawEntities.length,
      rawRelationships: rawRelationships.length,
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
  transcript: string,
  episodeTitle: string,
): Promise<{
  entities: any[]
  relationships: any[]
}> {
  try {
    // Limit transcript length to avoid token limits
    const truncatedTranscript = transcript.substring(0, 16000)
    console.log(`Sending ${truncatedTranscript.length} characters to OpenAI for entity and relationship extraction`)

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-16k",
      messages: [
        {
          role: "system",
          content: `You are a strategic business analyst specializing in identifying key entities, relationships, and competitive advantages from business discussions. Your task is to extract entities and their relationships from the following podcast transcript, with special attention to Hamilton Helmer's 7 Powers framework.

EPISODE TITLE: "${episodeTitle}"

PART 1: IDENTIFY THE MAIN COMPANIES
First, identify the 1-3 main companies that are the primary focus of this episode. These are the companies whose history, strategy, or business model is being analyzed in depth.

PART 2: ENTITIES
Identify and categorize entities into ONLY these three types:

1. "Company" - Business organizations, corporations, startups
2. "Person" - Individual people like founders, CEOs, investors, historical figures
3. "Topic" - Everything else including products, technologies, concepts, industries, themes, events, strategic frameworks

For each entity, provide a brief description that highlights strategic importance when applicable.

REQUIRED ENTITIES:
- ALWAYS include at least one "Topic" entity for the primary industry of each company discussed (e.g., "Semiconductor Industry", "Social Media", "E-commerce")
- ALWAYS include at least one "Topic" entity for the overarching theme of the episode (e.g., "Corporate Acquisitions", "Startup Growth", "Tech Innovation")
- ALWAYS create "Topic" entities for EACH of Hamilton Helmer's 7 Powers that are discussed in relation to ANY company:
  * Scale Economies - Declining unit costs with increased production
  * Network Economies - Value increases as customer base grows
  * Counter-Positioning - New position that incumbent can't copy without harming their business
  * Switching Costs - Customer's value loss when switching to an alternative
  * Branding - Habitual purchase based on trust beyond utilitarian value
  * Cornered Resource - Preferential access to a coveted asset
  * Process Power - Embedded company organization that enables lower costs

PART 3: RELATIONSHIPS
Create meaningful relationships between the entities you extracted. Ensure ALL entities are connected to the main company(ies) either directly or through other entities.

For each relationship, include:
1. The source entity name
2. The target entity name
3. A brief description of how they are related (e.g., "founded by", "acquired", "developed", "invested in")

REQUIRED RELATIONSHIPS:
- Connect each company to its industry with a relationship (e.g., "operates in", "is part of")
- Connect the episode theme to the main company(ies)
- Connect each person to their respective company(ies)
- Connect products/services to their parent companies
- Connect each main company to relevant topics discussed in the episode
- CRITICAL: For EACH of Hamilton Helmer's 7 Powers mentioned in the transcript:
  * If the hosts explicitly state a company has a specific power, create a relationship between that company and that power
  * If the hosts discuss a power but don't clearly attribute it to a company, connect that power to the main company with a description like "Discussed in relation to [Company]'s business model"
  * Even if the hosts are just explaining the concept, still create the power entity and connect it to the main company with a description that accurately reflects the context

NETWORK COMPLETENESS:
- Ensure that EVERY entity is connected to at least one other entity
- Ensure that there is a path from EVERY entity to at least one of the main companies (directly or indirectly)
- Create logical connections between related entities even if not explicitly stated (e.g., a founder should be connected to their company)

Format the output as a JSON object with two arrays:
1. "entities" - Array of entity objects
2. "relationships" - Array of relationship objects

Example response format:
{
  "entities": [
    {
      "name": "Microsoft",
      "type": "Company",
      "description": "Technology company founded in 1975 that built a dominant position in operating systems"
    },
    {
      "name": "Bill Gates",
      "type": "Person",
      "description": "Co-founder of Microsoft who drove its early strategic direction"
    },
    {
      "name": "Windows",
      "type": "Topic",
      "description": "Operating system developed by Microsoft that became industry standard"
    },
    {
      "name": "Software Industry",
      "type": "Topic",
      "description": "Industry focused on developing and distributing software products"
    },
    {
      "name": "Tech Pioneers",
      "type": "Topic",
      "description": "Overarching theme about early technology innovators and their impact"
    },
    {
      "name": "Network Economies",
      "type": "Topic",
      "description": "One of Hamilton Helmer's 7 Powers where a product becomes more valuable as more people use it"
    }
  ],
  "relationships": [
    {
      "source": "Bill Gates",
      "target": "Microsoft",
      "description": "Co-founded Microsoft in 1975 and shaped its aggressive business strategy"
    },
    {
      "source": "Microsoft",
      "target": "Windows",
      "description": "Developed the Windows operating system as its flagship product"
    },
    {
      "source": "Microsoft",
      "target": "Software Industry",
      "description": "Operates in the software industry as a dominant player"
    },
    {
      "source": "Tech Pioneers",
      "target": "Microsoft",
      "description": "Microsoft is considered a tech pioneer, which is a key theme of this episode"
    },
    {
      "source": "Microsoft",
      "target": "Network Economies",
      "description": "Leveraged network economies as users became locked into the Windows ecosystem"
    },
    {
      "source": "Windows",
      "target": "Network Economies",
      "description": "Windows demonstrated network effects as more developers created software for the platform"
    }
  ]
}

IMPORTANT GUIDELINES:
- First identify the main company or companies that are the focus of the episode
- Analyze the transcript through a strategic management lens, identifying key business strategies, competitive advantages, and market dynamics
- Only include entities that are significant to the episode's content
- Create relationships that form a connected network - every entity should be connected to at least one other entity
- Ensure there is a path from every entity to at least one main company
- Products like "iPhone", "Windows", or "MyChart" should be categorized as "Topic"
- Industries like "Healthcare", "Semiconductors", or "Finance" should be categorized as "Topic"
- Technologies like "AI", "Blockchain", or "Cloud Computing" should be categorized as "Topic"
- ALWAYS include industry topics for companies and an overarching theme topic for the episode
- ALWAYS create entities for any of Hamilton Helmer's 7 Powers mentioned and connect them to relevant companies`,
        },
        {
          role: "user",
          content: truncatedTranscript,
        },
      ],
      response_format: { type: "json_object" },
    })

    const content = response.choices[0].message.content
    if (!content) {
      throw new Error("Failed to extract entities and relationships from transcript")
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
