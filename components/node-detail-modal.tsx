"use client"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useState, useEffect } from "react"
import type { NodeData } from "@/types/graph"

interface NodeDetails {
  id: string
  name: string
  type: string
  description?: string
  episodes?: Array<{
    id: string
    title: string
    url: string
    date: string | null
  }>
}

const ExternalLinkIcon = () => (
  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
  </svg>
)

const CalendarIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

const UsersIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
  </svg>
)

const HashIcon = () => (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <line x1="4" y1="9" x2="20" y2="9" />
    <line x1="4" y1="15" x2="20" y2="15" />
    <line x1="10" y1="3" x2="8" y2="21" />
    <line x1="16" y1="3" x2="14" y2="21" />
  </svg>
)

interface NodeDetailModalProps {
  node: NodeData | null
  isOpen: boolean
  onClose: () => void
}

export default function NodeDetailModal({ node, isOpen, onClose }: NodeDetailModalProps) {
  const [nodeDetails, setNodeDetails] = useState<NodeDetails | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch node details when modal opens
  useEffect(() => {
    if (!node || !isOpen) {
      return
    }

    const fetchNodeDetails = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/node/${node.id}`)
        if (!response.ok) {
          throw new Error(`Failed to fetch node details: ${response.statusText}`)
        }
        const data = await response.json()
        setNodeDetails(data)
      } catch (err: any) {
        console.error("Error fetching node details:", err)
        setError(err.message || "Failed to load node details")
      } finally {
        setIsLoading(false)
      }
    }

    fetchNodeDetails()
  }, [node, isOpen])

  if (!node) return null

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Unknown date"
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    } catch {
      return dateString
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
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{node.name}</span>
            <Badge className={getTypeColor(node.type)}>{node.type}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="text-center py-8">
              <p className="text-red-500">{error}</p>
            </div>
          )}

          {/* Content */}
          {!isLoading && !error && nodeDetails && (
            <>
              {/* Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HashIcon />
                    Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <UsersIcon />
                    <span className="text-sm text-muted-foreground">Connections:</span>
                    <Badge variant="secondary">{node.connections}</Badge>
                  </div>
                  {nodeDetails.description && (
                    <div>
                      <span className="text-sm font-medium">Description:</span>
                      <p className="text-sm text-muted-foreground mt-1">{nodeDetails.description}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Episodes */}
              {nodeDetails.episodes && nodeDetails.episodes.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CalendarIcon />
                      Episodes ({nodeDetails.episodes.length})
                    </CardTitle>
                    <CardDescription>Episodes where this {node.type.toLowerCase()} is mentioned</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                      {nodeDetails.episodes.map((episode) => (
                        <div key={episode.id} className="border rounded-lg p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h4 className="font-medium text-sm">{episode.title}</h4>
                              {episode.date && (
                                <p className="text-xs text-muted-foreground mt-1">{formatDate(episode.date)}</p>
                              )}
                            </div>
                            {episode.url && (
                              <a
                                href={episode.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 p-1 hover:bg-muted rounded"
                              >
                                <ExternalLinkIcon />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Related Nodes */}
          {node.relatedNodes && node.relatedNodes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UsersIcon />
                  Related Entities ({node.relatedNodes.length})
                </CardTitle>
                <CardDescription>Other entities connected to this {node.type.toLowerCase()}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {node.relatedNodes.map((relatedNode) => (
                    <Badge key={relatedNode.id} variant="outline" className={getTypeColor(relatedNode.type)}>
                      {relatedNode.name}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
