/**
 * Process items in parallel with controlled concurrency using batching
 * @param items Array of items to process
 * @param processFn Function to process each item
 * @param concurrency Maximum number of concurrent operations (default: 5)
 * @returns Array of results
 */
export async function processInParallel<T, R>(
  items: T[],
  processFn: (item: T) => Promise<R>,
  concurrency = 5,
): Promise<R[]> {
  const results: R[] = []

  // Process items in batches
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)

    // Process all items in the batch concurrently
    const batchResults = await Promise.all(
      batch.map(item => processFn(item))
    )

    results.push(...batchResults)

    // Small delay between batches to avoid overwhelming the API
    if (i + concurrency < items.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  return results
}
