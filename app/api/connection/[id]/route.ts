import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

// Delete connection
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const connectionId = params.id

    // Delete the connection
    await sql`
      DELETE FROM "Connection"
      WHERE id = ${connectionId}
    `

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Connection delete error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
