"use client"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useState } from "react"
import { getAuthHeaders } from "@/lib/auth"

interface CreateEntityModalProps {
  isOpen: boolean
  onClose: () => void
}

const entityTypes = [
  "Company",
  "Person",
  "Topic",
  "Episode",
  "Industry",
  "Location",
  "Product",
]

export default function CreateEntityModal({ isOpen, onClose }: CreateEntityModalProps) {
  const [name, setName] = useState("")
  const [type, setType] = useState("Company")
  const [description, setDescription] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) {
      alert("Name is required")
      return
    }

    setIsCreating(true)
    try {
      const response = await fetch("/api/entity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          name: name.trim(),
          type,
          description: description.trim() || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to create entity")
      }

      onClose()
      // Reset form
      setName("")
      setType("Company")
      setDescription("")

      // Refresh the page to update the graph
      window.location.reload()
    } catch (err: any) {
      console.error("Error creating entity:", err)
      alert("Failed to create entity: " + err.message)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Entity</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Entity Type */}
          <div>
            <label className="text-sm font-medium mb-2 block">Type:</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-[#00E5C7]"
            >
              {entityTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Entity Name */}
          <div>
            <label className="text-sm font-medium mb-2 block">Name:</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter entity name..."
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-[#00E5C7]"
              autoFocus
            />
          </div>

          {/* Description Field */}
          <div>
            <label className="text-sm font-medium mb-2 block">Description (optional):</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this entity..."
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-[#00E5C7] resize-none"
              rows={4}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || isCreating}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? "Creating..." : "Create Entity"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
