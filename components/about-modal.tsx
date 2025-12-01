"use client"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface AboutModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function AboutModal({ isOpen, onClose }: AboutModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl text-[#00E5C7]">About Acquired Cinematic Universe</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <section>
            <h2 className="text-xl font-semibold mb-2">What is this?</h2>
            <p className="text-gray-300">
              Have you ever wondered what the Acquired Cinematic Universe actually looks like? This is my attempt to create that visualization.
              This is an interactive network graph of the interconnected companies and individuals discussed in the Acquired podcast.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">How it was built</h2>
            <p className="text-gray-300 mb-3">
              This project combines AI-powered entity extraction with a Next.js web application and PostgreSQL database.
              I scraped all episode transcripts from the Acquired website, then used Claude AI to process each transcript
              and identify key entities (companies, people, topics) along with their relationships. The AI also resolved
              entity mentions across episodes (e.g., recognizing "Apple" and "Apple Computer" as the same entity).
            </p>
            <p className="text-gray-300 mb-3">
              The frontend uses D3.js for force-directed graph visualization with custom physics to create an Obsidian-like
              feel - nodes settle naturally but respond smoothly when dragged. The graph supports panning, zooming, search,
              and interactive exploration of entity relationships.
            </p>
            <p className="text-gray-300">
              For a detailed technical breakdown of the architecture, AI prompts, and processing pipeline, I'll be writing
              an in-depth article on my{" "}
              <a
                href="https://substack.com/@pdavila"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00E5C7] hover:underline"
              >
                Substack
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Using the Graph</h2>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li><strong>Navigate:</strong> Click and drag on empty space to pan around the visualization</li>
              <li><strong>Zoom:</strong> Scroll or pinch to zoom in and out</li>
              <li><strong>View details:</strong> Left-click on any node to see detailed information, episodes mentioned, and related entities</li>
              <li><strong>Lock node:</strong> Right-click on a node to lock it in place - the highlight stays active so you can browse around and explore its connections in detail</li>
              <li><strong>View relationships:</strong> Click on any connection edge (line between nodes) to see relationship details and strength</li>
              <li><strong>Search:</strong> Use the search bar at the top to find and highlight specific entities</li>
              <li><strong>Drag nodes:</strong> Click and drag nodes to rearrange the graph - nearby nodes will respond naturally</li>
              <li><strong>Node size:</strong> Larger nodes have more connections across episodes</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">About Acquired Podcast</h2>
            <p className="text-gray-300">
              Acquired is a podcast about technology acquisitions and IPOs, hosted by Ben Gilbert and David Rosenthal.
              They explore the stories behind great companies and dive deep into what made them successful.
            </p>
            <p className="mt-2">
              <a
                href="https://www.acquired.fm"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00E5C7] hover:underline"
              >
                Visit Acquired.fm
              </a>
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
