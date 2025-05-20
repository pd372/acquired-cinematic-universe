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
    const { transcript } = await request.json()

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
          content: `Extract entities and their relationships from the following podcast transcript. 
      
      PART 1: ENTITIES
      Identify and categorize entities into ONLY these three types:
      
      1. "Company" - Business organizations, corporations, startups
      2. "Person" - Individual people like founders, CEOs, investors, historical figures
      3. "Topic" - Everything else including products, technologies, concepts, industries, themes, events
      
      For each entity, provide a brief description.
      
      REQUIRED ENTITIES:
      - ALWAYS include at least one "Topic" entity for the primary industry of each company discussed (e.g., "Semiconductor Industry", "Social Media", "E-commerce")
      - ALWAYS include at least one "Topic" entity for the overarching theme of the episode (e.g., "Corporate Acquisitions", "Startup Growth", "Tech Innovation")
      
      PART 2: RELATIONSHIPS
      Identify meaningful relationships between the entities you extracted. Only include relationships that are explicitly mentioned or strongly implied in the transcript.
      
      For each relationship, include:
      1. The source entity name
      2. The target entity name
      3. A brief description of how they are related (e.g., "founded by", "acquired", "developed", "invested in")
      
      REQUIRED RELATIONSHIPS:
      - Connect each company to its industry with a relationship (e.g., "operates in", "is part of")
      - Connect the episode theme to relevant entities discussed
      
      Format the output as a JSON object with two arrays:
      1. "entities" - Array of entity objects
      2. "relationships" - Array of relationship objects
      
      Example response format:
      {
        "entities": [
          {
            "name": "Microsoft",
            "type": "Company",
            "description": "Technology company founded in 1975"
          },
          {
            "name": "Bill Gates",
            "type": "Person",
            "description": "Co-founder of Microsoft"
          },
          {
            "name": "Windows",
            "type": "Topic",
            "description": "Operating system developed by Microsoft"
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
          }
        ],
        "relationships": [
          {
            "source": "Bill Gates",
            "target": "Microsoft",
            "description": "Co-founded Microsoft in 1975"
          },
          {
            "source": "Microsoft",
            "target": "Windows",
            "description": "Developed the Windows operating system"
          },
          {
            "source": "Microsoft",
            "target": "Software Industry",
            "description": "Operates in the software industry"
          },
          {
            "source": "Tech Pioneers",
            "target": "Bill Gates",
            "description": "Bill Gates is considered a tech pioneer, which is a key theme of this episode"
          }
        ]
      }
      
      IMPORTANT GUIDELINES:
      - Only include entities that are significant to the episode's content
      - Only create relationships between entities that are actually related in context
      - Products like "iPhone", "Windows", or "MyChart" should be categorized as "Topic"
      - Industries like "Healthcare", "Semiconductors", or "Finance" should be categorized as "Topic"
      - Technologies like "AI", "Blockchain", or "Cloud Computing" should be categorized as "Topic"
      - ALWAYS include industry topics for companies and an overarching theme topic for the episode`,
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
