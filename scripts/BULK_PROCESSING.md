# Bulk Episode Processing Guide

This script processes all Acquired podcast episodes in bulk using an optimized 3-phase approach.

## Prerequisites

1. **Development server running**: Make sure `npm run dev` is running in another terminal
2. **Environment variables**: Ensure `.env.local` has:
   - `DATABASE_URL`
   - `OPENAI_API_KEY`
   - `INTERNAL_API_KEY`

## How It Works

### Phase 1: Extraction (Parallel)
- Fetches all episode URLs from acquired.fm
- Processes 5 episodes at a time in parallel
- Extracts entities and relationships to staging tables
- Safe to run in parallel (no conflicts)

### Phase 2: Entity Resolution (Single Batch)
- Resolves all staged entities in one batch
- Uses hybrid matching (rule-based + LLM)
- Creates new entities or merges with existing
- Processes entities one-by-one internally (no context issues)

### Phase 3: Relationship Resolution (Single Batch)
- Resolves all staged relationships in one batch
- Cross-validates entity references
- Creates connections in the graph

## Usage

```bash
# Run the bulk processing script
npm run bulk-process
```

## What to Expect

### For ~200 episodes:

**Time Estimate:** 2-4 hours total
- Phase 1 (Extraction): 1-2 hours
- Phase 2 (Entity Resolution): 30-60 minutes
- Phase 3 (Relationship Resolution): 30-60 minutes

**Cost Estimate:** ~$10-20 in OpenAI API costs
- Mostly from entity resolution LLM calls
- gpt-3.5-turbo at ~$0.002 per entity needing LLM

### Output

The script provides detailed progress:
- Real-time extraction progress with success/fail counts
- Entity resolution statistics (created/merged)
- Relationship resolution statistics (created/skipped)
- Total cost tracking
- Final summary with performance metrics

### Example Output

```
🚀 Bulk Episode Processing Script - Option 2 Strategy
================================================================================
Strategy: Extract all → Resolve entities → Resolve relationships
================================================================================

📡 Fetching episodes list from acquired.fm...
✅ Found 245 episodes

📈 Summary:
   Total episodes found: 245
   Already processed: 3
   To process: 242

⚙️  Configuration:
   Extraction concurrency: 5 episodes at a time
   API endpoint: http://localhost:3000

🎬 Starting processing...

================================================================================
📦 PHASE 1: Extracting entities and relationships
   Processing 242 episodes with concurrency: 5
================================================================================

📦 Batch 1/49 (5 episodes)
   ✓ Berkshire Hathaway: 42 entities, 78 relationships
   ✓ Nike: 38 entities, 65 relationships
   ...

📊 Progress: 5/242 (2.1%)
   ✅ Successful: 5
   ❌ Failed: 0
   📝 Total entities staged: 185
   🔗 Total relationships staged: 312

[continues for all episodes...]

================================================================================
🔍 PHASE 2: Resolving entities
================================================================================

✅ Entity resolution complete!
   📊 Processed: 3245
   ✨ Created: 2847
   🔀 Merged: 398
   💰 Cost: $6.4920
   📈 Strategy stats: { rule-based-exact: 2856, llm-analysis: 389 }

================================================================================
🔗 PHASE 3: Resolving relationships
================================================================================

✅ Relationship resolution complete!
   📊 Processed: 8945
   ✨ Created: 8124
   ⏭️  Skipped: 821

================================================================================
🎉 Processing Complete!
================================================================================

📊 Final Statistics:
...
```

## Safety Features

- **Skip already processed**: Won't re-process episodes already in the database
- **Error handling**: Continues processing if individual episodes fail
- **Progress tracking**: Shows detailed progress throughout
- **Resumable**: If script crashes, just run it again - it skips completed episodes

## Monitoring

While running, you can monitor:
- Database in real-time using database tools
- API logs in the dev server terminal
- Script progress in the bulk-process terminal

## After Completion

Once finished:
1. Refresh your browser to see the complete knowledge graph
2. All episodes will be connected through shared entities
3. Click any node to see which episodes mention it

## Troubleshooting

**Script fails during extraction:**
- Check if dev server is running
- Verify acquired.fm is accessible
- Check API rate limits

**Entity resolution fails:**
- Check OPENAI_API_KEY is valid
- Verify you have API credits
- Check database connection

**Relationship resolution fails:**
- Usually means entity references are broken
- Check logs for specific errors
- May need to reset and retry

## Advanced Options

To modify behavior, edit `scripts/bulk-process-episodes.ts`:
- `concurrency: 5` - Number of parallel extractions
- `entityBatchSize: 10000` - Max entities per resolution
- `batchSize: 10000` - Max relationships per resolution
