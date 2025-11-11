"use client"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useState, useEffect } from "react"
import type { NodeData } from "@/types/graph"

interface CreateConnectionModalProps {
  isOpen: boolean
  onClose: () => void
  sourceNode: NodeData | null
  allNodes: NodeData[]
}

export default function CreateConnectionModal({
  isOpen,
  onClose,
  sourceNode,
  allNodes,
}: CreateConnectionModalProps) {
  const [targetNodeId, setTargetNodeId] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [filteredNodes, setFilteredNodes] = useState<NodeData[]>([])
  const [description, setDescription] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  // Filter nodes based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredNodes([])
      return
    }

    const filtered = allNodes.filter(
      (node) =>
        node.id !== sourceNode?.id && // Exclude source node
        node.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
    setFilteredNodes(filtered.slice(0, 10)) // Limit to 10 results
  }, [searchTerm, allNodes, sourceNode])

  const handleCreate = async () => {
    if (!sourceNode || !targetNodeId) return

    setIsCreating(true)
    try {
      const response = await fetch("/api/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceEntityId: sourceNode.id,
          targetEntityId: targetNodeId,
          description: description.trim() || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to create connection")
      }

      onClose()
      // Reset form
      setTargetNodeId("")
      setSearchTerm("")
      setDescription("")

      // Refresh the page to update the graph
      window.location.reload()
    } catch (err: any) {
      console.error("Error creating connection:", err)
      alert("Failed to create connection: " + err.message)
    } finally {
      setIsCreating(false)
    }
  }

  const selectedNode = allNodes.find((n) => n.id === targetNodeId)

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Connection</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source Node */}
          <div>
            <label className="text-sm font-medium mb-2 block">From:</label>
            <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded">
              {sourceNode?.name || "No node selected"}
            </div>
          </div>

          {/* Target Node Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">To:</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search for a node..."
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-[#00E5C7]"
            />

            {/* Dropdown for search results */}
            {filteredNodes.length > 0 && (
              <div className="mt-2 border rounded max-h-40 overflow-y-auto">
                {filteredNodes.map((node) => (
                  <div
                    key={node.id}
                    onClick={() => {
                      setTargetNodeId(node.id)
                      setSearchTerm(node.name)
                      setFilteredNodes([])
                    }}
                    className={`px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-between ${
                      targetNodeId === node.id ? "bg-[#00E5C7] text-gray-900" : ""
                    }`}
                  >
                    <span>{node.name}</span>
                    <span className="text-xs text-gray-500">{node.type}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Selected target node */}
            {selectedNode && filteredNodes.length === 0 && (
              <div className="mt-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-between">
                <span>{selectedNode.name}</span>
                <button
                  onClick={() => {
                    setTargetNodeId("")
                    setSearchTerm("")
                  }}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Description Field */}
          <div>
            <label className="text-sm font-medium mb-2 block">Description (optional):</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the relationship between these entities..."
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-[#00E5C7] resize-none"
              rows={3}
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
              disabled={!targetNodeId || isCreating}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? "Creating..." : "Create Connection"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
