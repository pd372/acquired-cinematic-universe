"use client"

import { useRef, useEffect } from "react"
import type { NodeData } from "@/types/graph"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface NodeDetailModalProps {
  node: NodeData
  onClose: () => void
}

export default function NodeDetailModal({ node, onClose }: NodeDetailModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleEscape)
    return () => window.removeEventListener("keydown", handleEscape)
  }, [onClose])

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener("mousedown", handleOutsideClick)
    return () => window.removeEventListener("mousedown", handleOutsideClick)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div
        ref={modalRef}
        className="bg-gray-900 border border-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-[#00E5C7]">{node.name}</h2>
              <Badge variant="outline" className="bg-gray-800">
                {node.type}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-white -mt-1 -mr-2"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-400">Connections</h3>
              <p className="text-lg font-semibold">{node.connections}</p>
            </div>

            {node.description && (
              <div>
                <h3 className="text-sm font-medium text-gray-400">Description</h3>
                <p className="text-sm">{node.description}</p>
              </div>
            )}

            {node.episodes && node.episodes.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-400">Mentioned in Episodes</h3>
                <ul className="space-y-2 mt-2">
                  {node.episodes.map((episode) => (
                    <li key={episode.id} className="flex items-start">
                      <a
                        href={episode.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm flex items-center gap-1 text-[#00E5C7] hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {episode.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {node.relatedNodes && node.relatedNodes.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-400">Related Entities</h3>
                <div className="flex flex-wrap gap-2 mt-2">
                  {node.relatedNodes.map((relatedNode) => (
                    <Badge key={relatedNode.id} variant="secondary" className="bg-gray-800 hover:bg-gray-700">
                      {relatedNode.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
