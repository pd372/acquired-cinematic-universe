import { useAuth } from "@/components/auth-provider"
import { useCallback } from "react"

/**
 * Hook for making authenticated API calls with CSRF token
 */
export function useAuthenticatedFetch() {
  const { csrfToken, isAdmin } = useAuth()

  const authenticatedFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      if (!isAdmin || !csrfToken) {
        throw new Error("Not authenticated")
      }

      const headers = {
        ...options.headers,
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      }

      return fetch(url, {
        ...options,
        headers,
        credentials: "include", // Important: include cookies
      })
    },
    [csrfToken, isAdmin],
  )

  return authenticatedFetch
}
