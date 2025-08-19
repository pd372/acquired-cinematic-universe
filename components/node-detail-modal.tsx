"use client"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ExternalLink, Calendar, Users, Hash } from "lucide-react"

interface Episode {
  id: string
  title: string
  url?: string
  date?: string
}

interface RelatedNode {
  id: string
  name: string
  type: string
}

interface NodeData {
  id: string
  name: string
  type: string
  connections: number
  description?: string
  episodes?: Episode[]
  relatedNodes?: RelatedNode[]
}

interface NodeDetailModalProps {
  node: NodeData | null
  isOpen: boolean
  onClose: () => void
}

export default function NodeDetailModal({ node, isOpen, onClose }: NodeDetailModalProps) {
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
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hash className="h-4 w-4" />
                Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Connections:</span>
                <Badge variant="secondary">{node.connections}</Badge>
              </div>
              {node.description && (
                <div>
                  <span className="text-sm font-medium">Description:</span>
                  <p className="text-sm text-muted-foreground mt-1">{node.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Episodes */}
          {node.episodes && node.episodes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Episodes ({node.episodes.length})
                </CardTitle>
                <CardDescription>Episodes where this {node.type.toLowerCase()} is mentioned</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {node.episodes.map((episode) => (
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
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Related Nodes */}
          {node.relatedNodes && node.relatedNodes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
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
