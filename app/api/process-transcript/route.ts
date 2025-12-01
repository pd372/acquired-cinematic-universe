import { type NextRequest, NextResponse } from "next/server"
import { OpenAI } from "openai"
import { processEpisode } from "@/lib/transcript-processor"
import { verifyAuthHeader } from "@/lib/auth"

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Force dynamic rendering for authenticated routes
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    if (!verifyAuthHeader(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { url, transcript, episodeId, episodeTitle } = await request.json()

    if (!transcript) {
      return NextResponse.json({ error: "Transcript is required" }, { status: 400 })
    }

    // Process the transcript to extract entities (Phase 1 only)
    const result = await processEpisode(url)

    return NextResponse.json({
      success: true,
      message: result.message,
      episodeId: result.episodeId,
      rawEntities: result.rawEntities,
      rawRelationships: result.rawRelationships,
      phase: "extraction",
      note: "Entities and relationships have been extracted and staged. Run the resolution phase to integrate them into the knowledge graph.",
    })
  } catch (error) {
    console.error("Error processing transcript:", error)
    return NextResponse.json({ error: "Failed to process transcript" }, { status: 500 })
  }
}

// Function to extract entities from transcript using OpenAI
// This function is no longer needed as processEpisode handles it
// async function extractEntities(transcript: string) {
//   // Use OpenAI to extract entities from the transcript
//   const response = await openai.chat.completions.create({
//     model: "gpt-3.5-turbo",
//     messages: [
//       {
//         role: "system",
//         content: `Extract entities from the following podcast transcript.
//         Identify companies, people, and topics/themes mentioned.
//         For each entity, provide a brief description if possible.
//         Format the output as a JSON array with objects containing:
//         {
//           "name": "Entity Name",
//           "type": "Company|Person|Topic",
//           "description": "Brief description"
//         }`,
//       },
//       {
//         role: "user",
//         content: transcript.substring(0, 16000), // Limit to avoid token limits
//       },
//     ],
//     response_format: { type: "json_object" },
//   })

//   const content = response.choices[0].message.content
//   if (!content) {
//     throw new Error("Failed to extract entities from transcript")
//   }

//   try {
//     const parsedContent = JSON.parse(content)
//     return parsedContent.entities || []
//   } catch (error) {
//     console.error("Error parsing OpenAI response:", error)
//     throw new Error("Failed to parse entity extraction results")
//   }
// }

// Function to update graph data with new entities and links
// This function is no longer needed as processEpisode handles it
// async function updateGraphData(entities: any[], episode: { id: string; title: string; url: string }) {
//   const dataPath = path.join(process.cwd(), "data")
//   const graphPath = path.join(dataPath, "graph.json")

//   // Create data directory if it doesn't exist
//   if (!fs.existsSync(dataPath)) {
//     fs.mkdirSync(dataPath, { recursive: true })
//   }

//   // Load existing graph data or initialize new data
//   let graphData: GraphData = { nodes: [], links: [] }
//   if (fs.existsSync(graphPath)) {
//     const fileData = fs.readFileSync(graphPath, "utf8")
//     graphData = JSON.parse(fileData)
//   }

//   // Process entities and update graph
//   const newNodes: NodeData[] = []
//   const newLinks: LinkData[] = []
//   const existingNodeIds = new Set(graphData.nodes.map((node) => node.id))

//   // Process each entity
//   entities.forEach((entity, index) => {
//     const entityId = `${entity.name.replace(/\s+/g, "_").toLowerCase()}_${entity.type.toLowerCase()}`

//     // Check if node already exists
//     const existingNodeIndex = graphData.nodes.findIndex(
//       (node) =>
//         node.name.toLowerCase() === entity.name.toLowerCase() && node.type.toLowerCase() === entity.type.toLowerCase(),
//     )

//     if (existingNodeIndex === -1) {
//       // Add new node
//       const newNode: NodeData = {
//         id: entityId,
//         name: entity.name,
//         type: entity.type as "Company" | "Person" | "Topic",
//         connections: 0,
//         description: entity.description || "",
//         episodes: [
//           {
//             id: episode.id,
//             title: episode.title,
//             url: episode.url,
//             date: new Date().toISOString().split("T")[0],
//           },
//         ],
//       }
//       newNodes.push(newNode)
//     } else {
//       // Update existing node
//       const existingNode = graphData.nodes[existingNodeIndex]

//       // Add episode if not already present
//       if (!existingNode.episodes?.some((ep) => ep.id === episode.id)) {
//         if (!existingNode.episodes) existingNode.episodes = []
//         existingNode.episodes.push({
//           id: episode.id,
//           title: episode.title,
//           url: episode.url,
//           date: new Date().toISOString().split("T")[0],
//         })
//       }
//     }
//   })

//   // Create links between entities mentioned in the same episode
//   for (let i = 0; i < entities.length; i++) {
//     for (let j = i + 1; j < entities.length; j++) {
//       const sourceId = `${entities[i].name.replace(/\s+/g, "_").toLowerCase()}_${entities[i].type.toLowerCase()}`
//       const targetId = `${entities[j].name.replace(/\s+/g, "_").toLowerCase()}_${entities[j].type.toLowerCase()}`

//       // Check if link already exists
//       const existingLinkIndex = graphData.links.findIndex(
//         (link) =>
//           (link.source === sourceId && link.target === targetId) ||
//           (link.source === targetId && link.target === sourceId),
//       )

//       if (existingLinkIndex === -1) {
//         // Add new link
//         newLinks.push({
//           source: sourceId,
//           target: targetId,
//           value: 1,
//         })
//       } else {
//         // Increment value of existing link
//         graphData.links[existingLinkIndex].value += 1
//       }
//     }
//   }

//   // Add new nodes and links to graph data
//   graphData.nodes = [...graphData.nodes, ...newNodes]
//   graphData.links = [...graphData.links, ...newLinks]

//   // Update connection counts for all nodes
//   const nodeLinkCounts = new Map<string, number>()
//   graphData.links.forEach((link) => {
//     const sourceId = typeof link.source === "string" ? link.source : link.source.id
//     const targetId = typeof link.target === "string" ? link.target : link.target.id

//     nodeLinkCounts.set(sourceId, (nodeLinkCounts.get(sourceId) || 0) + 1)
//     nodeLinkCounts.set(targetId, (nodeLinkCounts.get(targetId) || 0) + 1)
//   })

//   graphData.nodes.forEach((node) => {
//     node.connections = nodeLinkCounts.get(node.id) || 0
//   })

//   // Save updated graph data
//   fs.writeFileSync(graphPath, JSON.stringify(graphData, null, 2))
// }
