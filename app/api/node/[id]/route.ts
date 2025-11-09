import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

// Allow caching for this route
export const dynamic = "force-dynamic"
export const revalidate = 300 // Revalidate every 5 minutes

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const nodeId = params.id

    console.log(`Fetching details for node: ${nodeId}`)

    // Get entity details
    const entity = await sql`
      SELECT id, name, type, description
      FROM "Entity"
      WHERE id = ${nodeId}
      LIMIT 1
    `

    if (entity.length === 0) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 })
    }

    // Get episodes where this entity is mentioned
    const episodes = await sql`
      SELECT
        e.id,
        e.title,
        e.url,
        e."publishedAt" as date
      FROM "EntityMention" em
      JOIN "Episode" e ON em."episodeId" = e.id
      WHERE em."entityId" = ${nodeId}
      ORDER BY e."publishedAt" DESC
    `

    const nodeDetails = {
      id: entity[0].id,
      name: entity[0].name,
      type: entity[0].type,
      description: entity[0].description,
      episodes: episodes.map((ep: any) => ({
        id: ep.id,
        title: ep.title,
        url: ep.url,
        date: ep.date ? new Date(ep.date).toISOString().split("T")[0] : null,
      })),
    }

    console.log(`Returning details for ${entity[0].name} with ${episodes.length} episodes`)

    return NextResponse.json(nodeDetails, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      }
    })
  } catch (error: any) {
    console.error("Node details API error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
