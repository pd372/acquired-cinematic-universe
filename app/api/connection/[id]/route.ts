import { NextResponse, NextRequest } from "next/server"
import { neon } from "@neondatabase/serverless"
import { verifyAuthHeader } from "@/lib/auth"

const sql = neon(process.env.DATABASE_URL!)

// Delete connection
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  // Check authentication
  if (!verifyAuthHeader(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

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
