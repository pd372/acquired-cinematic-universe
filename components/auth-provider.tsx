"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { getClientSession, saveClientSession, clearClientSession, isSessionValid, AuthSession } from "@/lib/auth"

interface AuthContextType {
  isAdmin: boolean
  login: (password: string) => Promise<boolean>
  logout: () => void
  checkSession: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false)

  // Check session on mount and periodically
  useEffect(() => {
    checkSession()

    // Check session every minute
    const interval = setInterval(checkSession, 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  function checkSession() {
    const session = getClientSession()
    const valid = isSessionValid(session)
    setIsAdmin(valid)

    if (!valid && session) {
      // Session expired, clear it
      clearClientSession()
    }
  }

  async function login(password: string): Promise<boolean> {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })

      if (!response.ok) {
        return false
      }

      const session: AuthSession = await response.json()
      saveClientSession(session)
      setIsAdmin(true)
      return true
    } catch (error) {
      console.error("Login error:", error)
      return false
    }
  }

  function logout() {
    clearClientSession()
    setIsAdmin(false)
  }

  return (
    <AuthContext.Provider value={{ isAdmin, login, logout, checkSession }}>
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
