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
            <p className="text-gray-300 mb-3">
              Have you ever wondered what the Acquired Cinematic Universe actually looks like? This is my attempt to create that visualization.
              This is an interactive network graph of the interconnected companies and individuals discussed in the Acquired podcast.
            </p>
            <p className="text-gray-300 mb-3">
              This project was built as a passion project by a fan of the show, with no commercial intention. It's simply a way to explore
              and visualize the rich network of connections that Ben and David have explored over the years. This is a work in progress - I'll
              be adding each episode as they come out and making improvements to the graph navigation and quality.
            </p>
            <p className="text-gray-300">
              If you want to connect or make suggestions, I'm on the Acquired Slack or you can reach me on{" "}
              <a
                href="https://www.linkedin.com/in/pedro-d-avila-86641b170/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#00E5C7] hover:underline"
              >
                LinkedIn
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
            <h2 className="text-xl font-semibold mb-2">How it was built</h2>
            <p className="text-gray-300 mb-3">
              I fetched transcripts for all Acquired and ACQ2 episodes, broke them into chunks, and processed them in parallel
              through an LLM API to extract entities (companies and individuals). These were stored in staging tables, then ran
              through an entity resolution process to deduplicate mentions across episodes (e.g., "Apple" and "Apple Computer"
              map to the same entity). This resolution step is what creates the cross-episode connections - when mentions of the
              same company or individual get merged, they end up connecting across all episodes they appeared in. I then extracted
              relationships between entities and promoted everything to production tables.
            </p>
            <p className="text-gray-300">
              For a detailed breakdown of the architecture, prompts, and processing pipeline, I'll be writing
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
