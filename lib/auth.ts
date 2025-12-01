import { NextRequest } from "next/server"
import { env } from "./env"

// Simple password check - uses environment-validated password
const ADMIN_PASSWORD = env.ADMIN_PASSWORD

// Session expiry: 1 hour
export const SESSION_DURATION = 60 * 60 * 1000 // 1 hour in milliseconds

export interface AuthSession {
  authenticated: boolean
  expiresAt: number
}

/**
 * Verify password matches the admin password
 */
export function verifyPassword(password: string): boolean {
  return password === ADMIN_PASSWORD
}

/**
 * Create a session token (simple timestamp-based)
 */
export function createSession(): AuthSession {
  return {
    authenticated: true,
    expiresAt: Date.now() + SESSION_DURATION,
  }
}

/**
 * Check if session is still valid
 */
export function isSessionValid(session: AuthSession | null): boolean {
  if (!session || !session.authenticated) {
    return false
  }
  return Date.now() < session.expiresAt
}

/**
 * Server-side: Verify auth from request headers
 */
export function verifyAuthHeader(request: NextRequest): boolean {
  const authHeader = request.headers.get("x-admin-auth")

  if (!authHeader) {
    return false
  }

  try {
    const session: AuthSession = JSON.parse(authHeader)
    return isSessionValid(session)
  } catch {
    return false
  }
}

/**
 * Client-side: Get session from localStorage
 */
export function getClientSession(): AuthSession | null {
  if (typeof window === "undefined") return null

  const stored = localStorage.getItem("admin-session")
  if (!stored) return null

  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

/**
 * Client-side: Save session to localStorage
 */
export function saveClientSession(session: AuthSession): void {
  if (typeof window === "undefined") return
  localStorage.setItem("admin-session", JSON.stringify(session))
}

/**
 * Client-side: Clear session
 */
export function clearClientSession(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem("admin-session")
}

/**
 * Client-side: Get auth headers for API calls
 */
export function getAuthHeaders(): Record<string, string> {
  const session = getClientSession()
  if (!session || !isSessionValid(session)) {
    return {}
  }

  return {
    "x-admin-auth": JSON.stringify(session),
  }
}
