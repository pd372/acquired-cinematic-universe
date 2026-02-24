"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"

interface AuthContextType {
  isAdmin: boolean
  csrfToken: string | null
  login: (password: string) => Promise<boolean>
  logout: () => Promise<void>
  checkSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [csrfToken, setCsrfToken] = useState<string | null>(null)

  // Check session on mount and periodically
  useEffect(() => {
    checkSession()

    // Check session every 5 minutes
    const interval = setInterval(checkSession, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  async function checkSession() {
    try {
      const response = await fetch("/api/auth/session", {
        credentials: "include", // Important: include cookies
      })

      if (response.ok) {
        const data = await response.json()
        setIsAdmin(data.authenticated)
        setCsrfToken(data.csrfToken || null)
      } else {
        setIsAdmin(false)
        setCsrfToken(null)
      }
    } catch (error) {
      setIsAdmin(false)
      setCsrfToken(null)
    }
  }

  async function login(password: string): Promise<boolean> {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Important: include cookies
        body: JSON.stringify({ password }),
      })

      if (!response.ok) {
        return false
      }

      const data = await response.json()
      if (data.success && data.csrfToken) {
        setIsAdmin(true)
        setCsrfToken(data.csrfToken)
        return true
      }

      return false
    } catch (error) {
      return false
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      })
    } catch (error) {
      // Silent logout failure
    } finally {
      setIsAdmin(false)
      setCsrfToken(null)
    }
  }

  return (
    <AuthContext.Provider value={{ isAdmin, csrfToken, login, logout, checkSession }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
