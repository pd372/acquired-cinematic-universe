"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Upload } from "lucide-react"
import { toast } from "@/components/ui/use-toast"

export default function TranscriptUploader() {
  const [episodeTitle, setEpisodeTitle] = useState("")
  const [episodeUrl, setEpisodeUrl] = useState("")
  const [transcript, setTranscript] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!episodeTitle || !episodeUrl || !transcript) {
      toast({
        title: "Missing information",
        description: "Please fill in all fields",
        variant: "destructive",
      })
      return
    }

    try {
      setIsProcessing(true)

      const response = await fetch("/api/process-transcript", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          episodeId: `ep_${Date.now()}`,
          episodeTitle,
          url: episodeUrl,
          transcript,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to process transcript")
      }

      const result = await response.json()

      toast({
        title: "Success!",
        description: `Processed ${result.entities?.length || 0} entities from the transcript`,
      })

      // Reset form
      setEpisodeTitle("")
      setEpisodeUrl("")
      setTranscript("")
    } catch (error) {
      console.error("Error processing transcript:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process transcript",
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Card className="w-full max-w-2xl bg-gray-900 border-gray-800 text-white">
      <CardHeader>
        <CardTitle className="text-[#00E5C7]">Upload Transcript</CardTitle>
        <CardDescription>
          Add a new podcast transcript to extract entities and update the knowledge graph
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="episodeTitle">Episode Title</Label>
            <Input
              id="episodeTitle"
              value={episodeTitle}
              onChange={(e) => setEpisodeTitle(e.target.value)}
              placeholder="e.g., The History of Apple"
              className="bg-gray-800 border-gray-700"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="episodeUrl">Episode URL</Label>
            <Input
              id="episodeUrl"
              value={episodeUrl}
              onChange={(e) => setEpisodeUrl(e.target.value)}
              placeholder="https://www.acquired.fm/episodes/..."
              className="bg-gray-800 border-gray-700"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="transcript">Transcript</Label>
            <Textarea
              id="transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste the episode transcript here..."
              className="min-h-[200px] bg-gray-800 border-gray-700"
            />
          </div>
        </CardContent>

        <CardFooter>
          <Button type="submit" disabled={isProcessing} className="bg-[#00E5C7] text-black hover:bg-[#00C7AD] w-full">
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Process Transcript
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
