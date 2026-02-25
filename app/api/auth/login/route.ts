import { NextRequest, NextResponse } from "next/server"
import { verifyPassword, createSession, setSessionCookie } from "@/lib/session"
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { loginSchema } from "@/lib/validation"

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = rateLimit(request, RATE_LIMITS.AUTH)
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  try {
    const body = await request.json()

    // Validate input
    const validation = loginSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.issues },
        { status: 400 },
      )
    }

    const { password } = validation.data

    if (!verifyPassword(password)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    // Create session with CSRF token
    const session = createSession()
    const response = NextResponse.json({
      success: true,
      csrfToken: session.csrfToken,
    })

    // Set secure HTTP-only cookie
    setSessionCookie(response, session)

    return response
  } catch (error) {
    return NextResponse.json({ error: "Login failed" }, { status: 500 })
  }
}
