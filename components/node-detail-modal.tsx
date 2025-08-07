'use client'

import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface NodeData {
  id: string
  name: string
  type: string
  connections: number
  description?: string
  episodes?: Array<{
    id: string
    title: string
    url?: string
    date?: string
  }>
}

interface NodeDetailModalProps {
  node: NodeData | null
  isOpen: boolean
  onClose: () => void
}

export function NodeDetailModal({ node, isOpen, onClose }: NodeDetailModalProps) {
  if (!node) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] md:max-w-[600px] lg:max-w-[800px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="text-2xl font-bold">{node.name}</span>
            <Button variant="ghost" size="icon" onClick={onClose} className="ml-auto">
              <X className="h-5 w-5" />
            </Button>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <Badge variant="secondary">{node.type}</Badge>
            <span className="text-sm text-gray-500">Connections: {node.connections}</span>
          </DialogDescription>
        </DialogHeader>
        <Separator className="my-2" />
        <ScrollArea className="flex-grow pr-4">
          {node.description && (
            <div className="mb-4">
              <h3 className="font-semibold text-lg mb-1">Description</h3>
              <p className="text-gray-700 dark:text-gray-300 text-sm">{node.description}</p>
            </div>
          )}

          {node.episodes && node.episodes.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold text-lg mb-2">Mentioned In Episodes</h3>
              <ul className="space-y-2">
                {node.episodes.map((episode) => (
                  <li key={episode.id} className="flex items-center justify-between p-2 border rounded-md bg-gray-50 dark:bg-gray-800">
                    <div>
                      <p className="font-medium text-sm">{episode.title}</p>
                      {episode.date && <p className="text-xs text-gray-500 dark:text-gray-400">{episode.date}</p>}
                    </div>
                    {episode.url && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={episode.url} target="_blank" rel="noopener noreferrer">
                          View Episode
                        </a>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

export default NodeDetailModal
