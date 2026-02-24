import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { env } from "./env"

// Session configuration
const SESSION_COOKIE_NAME = "admin_session"
const SESSION_DURATION = 60 * 60 * 1000 // 1 hour in milliseconds

export interface SessionData {
  authenticated: boolean
  expiresAt: number
  csrfToken: string
}

/**
 * Generate a random CSRF token
 */
function generateCSRFToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/**
 * Encode session data to a simple encrypted format
 * Note: For production, consider using iron-session or JWT with proper signing
 */
function encodeSession(data: SessionData): string {
  return Buffer.from(JSON.stringify(data)).toString("base64")
}

/**
 * Decode session data
 */
function decodeSession(encoded: string): SessionData | null {
  try {
    const json = Buffer.from(encoded, "base64").toString("utf8")
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * Create a new session with CSRF token
 */
export function createSession(): SessionData {
  return {
    authenticated: true,
    expiresAt: Date.now() + SESSION_DURATION,
    csrfToken: generateCSRFToken(),
  }
}

/**
 * Check if session is valid
 */
export function isSessionValid(session: SessionData | null): boolean {
  if (!session || !session.authenticated) {
    return false
  }
  return Date.now() < session.expiresAt
}

/**
 * Set session cookie (HTTP-only, Secure, SameSite)
 */
export function setSessionCookie(response: NextResponse, session: SessionData): void {
  const encoded = encodeSession(session)
  const maxAge = Math.floor((session.expiresAt - Date.now()) / 1000)

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: encoded,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: maxAge,
    path: "/",
  })
}

/**
 * Clear session cookie
 */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.delete(SESSION_COOKIE_NAME)
}

/**
 * Get session from request cookies
 */
export function getSessionFromCookies(request: NextRequest): SessionData | null {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)
  if (!sessionCookie) {
    return null
  }

  const session = decodeSession(sessionCookie.value)
  if (!session || !isSessionValid(session)) {
    return null
  }

  return session
}

/**
 * Verify CSRF token matches session
 */
export function verifyCSRFToken(request: NextRequest, session: SessionData): boolean {
  const csrfToken = request.headers.get("x-csrf-token")
  if (!csrfToken) {
    return false
  }
  return csrfToken === session.csrfToken
}

/**
 * Verify authentication and CSRF token for state-modifying operations
 * Returns session if valid, null otherwise
 */
export function verifyAuthAndCSRF(request: NextRequest): SessionData | null {
  const session = getSessionFromCookies(request)
  if (!session) {
    return null
  }

  // For state-modifying requests (POST, PUT, DELETE, PATCH), verify CSRF
  if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
    if (!verifyCSRFToken(request, session)) {
      return null
    }
  }

  return session
}

/**
 * Verify authentication only (for GET requests)
 */
export function verifyAuth(request: NextRequest): SessionData | null {
  return getSessionFromCookies(request)
}

/**
 * Verify password matches admin password
 */
export function verifyPassword(password: string): boolean {
  return password === env.ADMIN_PASSWORD
}
