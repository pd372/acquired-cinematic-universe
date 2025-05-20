export default function AboutPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white p-4">
      <div className="max-w-2xl w-full bg-gray-900 p-8 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold mb-6 text-[#00E5C7]">About Acquired Cinematic Universe</h1>

        <div className="space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-2">What is this?</h2>
            <p className="text-gray-300">
              Acquired Cinematic Universe is an interactive knowledge graph visualization of the interconnected companies,
              people, and topics discussed in the Acquired podcast. It allows you to explore the relationships between
              different entities mentioned across episodes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">How it works</h2>
            <p className="text-gray-300">
              I process episode transcripts using natural language processing to identify key entities (companies,
              people, and topics). These entities become nodes in our knowledge graph, with connections formed when
              entities are mentioned together in the same episode.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">Using the Graph</h2>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>Click and drag to pan around the visualization</li>
              <li>Scroll to zoom in and out</li>
              <li>Click on any node to see detailed information</li>
              <li>Larger nodes have more connections across episodes</li>
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
      </div>
    </main>
  )
}
