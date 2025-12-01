"use client"
import type React from "react"
import "./globals.css"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/components/auth-provider"
import NavBar from "@/components/nav-bar"
import AboutModal from "@/components/about-modal"
import { Toaster } from "@/components/ui/toaster"
import { useState } from "react"

const inter = Inter({ subsets: ["latin"] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isAboutOpen, setIsAboutOpen] = useState(false)

  return (
    <html lang="en" className="h-full">
      <head>
        <title>Acquired Cinematic Universe</title>
        <meta name="description" content="Interactive knowledge graph for the Acquired podcast" />
      </head>
      <body className={`${inter.className} bg-black text-white h-full overflow-hidden`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <AuthProvider>
            <NavBar onAboutClick={() => setIsAboutOpen(true)} />
            <div className="h-full pt-16">{children}</div>
            <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
