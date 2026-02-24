import { NextRequest, NextResponse } from "next/server"
import { getSessionFromCookies } from "@/lib/session"

export async function GET(request: NextRequest) {
  const session = getSessionFromCookies(request)

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  return NextResponse.json({
    authenticated: true,
    csrfToken: session.csrfToken,
  })
}
