import { type NextRequest, NextResponse } from "next/server"
import { OpenAI } from "openai"

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Check for API key or other authentication
    const authHeader = request.headers.get("authorization")
    if (!process.env.INTERNAL_API_KEY || authHeader !== `Bearer ${process.env.INTERNAL_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Get transcript from request body
    const { transcript, title } = await request.json()

    if (!transcript) {
      return NextResponse.json({ error: "Transcript is required" }, { status: 400 })
    }

    // Limit transcript length
    const truncatedTranscript = transcript.substring(0, 16000)
    console.log(`Sending ${truncatedTranscript.length} characters to OpenAI for entity and relationship extraction`)

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-16k",
      messages: [
        {
          role: "system",
          content: `You are a strategic business analyst specializing in identifying key entities, relationships, and competitive advantages from business discussions. Your task is to extract entities and their relationships from the following podcast transcript, with special attention to Hamilton Helmer's 7 Powers framework.

EPISODE TITLE: "${title || "Untitled Episode"}"

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
      return NextResponse.json({ error: "No content in OpenAI response" }, { status: 500 })
    }

    // Try to parse the response
    try {
      const parsedContent = JSON.parse(content)
      return NextResponse.json({
        success: true,
        rawResponse: content,
        parsedResponse: parsedContent,
        entityCount: parsedContent.entities?.length || 0,
        relationshipCount: parsedContent.relationships?.length || 0,
      })
    } catch (error) {
      return NextResponse.json({
        success: false,
        error: "Failed to parse OpenAI response",
        rawResponse: content,
      })
    }
  } catch (error) {
    console.error("Error in debug-openai API:", error)
    return NextResponse.json(
      { error: `Failed to process: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
