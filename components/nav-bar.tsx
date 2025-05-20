"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Home, Info } from "lucide-react"

export default function NavBar() {
  const pathname = usePathname()

  const navItems = [
    { href: "/", label: "Graph", icon: Home },
    { href: "/about", label: "About", icon: Info },
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4 bg-black bg-opacity-80 backdrop-blur-sm border-t border-gray-800 md:top-0 md:bottom-auto md:border-t-0 md:border-b">
      <nav className="flex space-x-1">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-center px-4 py-2 rounded-md transition-colors",
                pathname === item.href
                  ? "bg-gray-800 text-[#00E5C7]"
                  : "text-gray-400 hover:text-white hover:bg-gray-800",
              )}
            >
              <Icon className="h-5 w-5 mr-2" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
