"use client"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useState } from "react"
import type { LinkData, NodeData } from "@/types/graph"

const ArrowRightIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
)

const InfoIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
)

const StrengthIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

interface EdgeDetailModalProps {
  edge: LinkData | null
  nodes: NodeData[] | null
  isOpen: boolean
  onClose: () => void
}

export default function EdgeDetailModal({ edge, nodes, isOpen, onClose }: EdgeDetailModalProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  if (!edge || !nodes) return null

  // Get source and target node data
  const sourceId = typeof edge.source === "string" ? edge.source : edge.source.id
  const targetId = typeof edge.target === "string" ? edge.target : edge.target.id

  const sourceNode = nodes.find((n) => n.id === sourceId)
  const targetNode = nodes.find((n) => n.id === targetId)

  if (!sourceNode || !targetNode) return null

  const handleDelete = async () => {
    if (!edge.id) {
      alert("Cannot delete connection: No connection ID found")
      return
    }

    if (!confirm(`Are you sure you want to delete the connection between "${sourceNode.name}" and "${targetNode.name}"?`)) {
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/connection/${edge.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete connection")
      }

      onClose()

      // Refresh the page to update the graph
      window.location.reload()
    } catch (err: any) {
      console.error("Error deleting connection:", err)
      alert("Failed to delete connection: " + err.message)
    } finally {
      setIsDeleting(false)
    }
  }

  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case "company":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
      case "person":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300"
      case "topic":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
      case "episode":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300"
      case "industry":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
      case "location":
        return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300"
      case "product":
        return "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-300"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="space-y-3">
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightIcon />
              Relationship
            </DialogTitle>

            {/* Delete Button */}
            {edge.id && (
              <div>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 text-sm"
                >
                  {isDeleting ? "Deleting..." : "Delete Connection"}
                </button>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Connection Path */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <InfoIcon />
                Connection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col items-center gap-2 flex-1">
                  <Badge className={getTypeColor(sourceNode.type)}>{sourceNode.type}</Badge>
                  <p className="text-center font-medium text-sm">{sourceNode.name}</p>
                  <p className="text-xs text-muted-foreground">{sourceNode.connections} connections</p>
                </div>

                <div className="flex items-center justify-center">
                  <ArrowRightIcon />
                </div>

                <div className="flex flex-col items-center gap-2 flex-1">
                  <Badge className={getTypeColor(targetNode.type)}>{targetNode.type}</Badge>
                  <p className="text-center font-medium text-sm">{targetNode.name}</p>
                  <p className="text-xs text-muted-foreground">{targetNode.connections} connections</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Connection Strength */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <StrengthIcon />
                Relationship Strength
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {edge.value} {edge.value === 1 ? "mention" : "mentions"}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  across episodes
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Description */}
          {edge.description && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <InfoIcon />
                  Context
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{edge.description}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
