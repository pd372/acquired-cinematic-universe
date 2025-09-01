"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const HomeIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9,22 9,12 15,12 15,22" />
  </svg>
)

const InfoIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
)

export default function NavBar() {
  const pathname = usePathname()

  const navItems = [
    { href: "/", label: "Graph", icon: HomeIcon },
    { href: "/about", label: "About", icon: InfoIcon },
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
              <Icon />
              <span className="ml-2">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
