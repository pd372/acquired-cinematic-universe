"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/auth-provider"
import AdminLoginModal from "@/components/admin-login-modal"
import { useRouter } from "next/navigation"

export default function AdminPage() {
  const { isAdmin, logout } = useAuth()
  const [showLoginModal, setShowLoginModal] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!isAdmin) {
      setShowLoginModal(true)
    }
  }, [isAdmin])

  const handleLogout = () => {
    logout()
    router.push("/")
  }

  const handleLoginClose = () => {
    if (!isAdmin) {
      // If they close without logging in, redirect to home
      router.push("/")
    } else {
      setShowLoginModal(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <AdminLoginModal isOpen={showLoginModal} onClose={handleLoginClose} />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black text-white p-8">
      <div className="max-w-2xl w-full space-y-6">
        <h1 className="text-3xl font-bold text-green-400">Admin Access Granted</h1>

        <div className="bg-gray-800 p-6 rounded-lg space-y-4">
          <h2 className="text-xl font-semibold">Admin Features Enabled</h2>
          <p className="text-gray-300">
            You now have access to all admin features throughout the application:
          </p>

          <ul className="list-disc list-inside space-y-2 text-gray-300">
            <li>Edit entity names (click any node)</li>
            <li>Delete entities and their connections</li>
            <li>Create new entities (floating + button)</li>
            <li>Create connections between entities</li>
            <li>Delete connections (click any edge)</li>
          </ul>

          <p className="text-sm text-gray-400 mt-4">
            Session expires in 1 hour of inactivity.
          </p>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
          >
            Go to Graph
          </button>
          <button
            onClick={handleLogout}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-md"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}
