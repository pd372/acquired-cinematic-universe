# Acquired Zettelkasten

An interactive knowledge graph visualization for the Acquired podcast.

## Database and Scraping Setup

### Initial Setup

1. Copy `.env.example` to `.env` and fill in the required values:
   \`\`\`
   cp .env.example .env
   \`\`\`

2. Install dependencies:
   \`\`\`
   npm install
   \`\`\`

3. Test the database connection:
   \`\`\`
   npm run test-db
   \`\`\`

### Scraping Episodes

#### Option 1: Using the API directly

To scrape a single episode:
\`\`\`
curl -X POST "http://localhost:3000/api/scrape?url=https://www.acquired.fm/episodes/example-episode" \
  -H "Authorization: Bearer your-internal-api-key"
\`\`\`

To scrape all episodes:
\`\`\`
curl -X POST "http://localhost:3000/api/scrape?all=true" \
  -H "Authorization: Bearer your-internal-api-key"
\`\`\`

#### Option 2: Using the npm scripts

To scrape a specific episode:
\`\`\`
npm run scrape https://www.acquired.fm/episodes/example-episode
\`\`\`

To scrape all episodes:
\`\`\`
npm run scrape:all
\`\`\`

## Development

Run the development server:
\`\`\`
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
