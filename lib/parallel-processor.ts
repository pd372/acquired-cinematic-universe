/**
 * Process items in parallel with controlled concurrency
 * @param items Array of items to process
 * @param processFn Function to process each item
 * @param concurrency Maximum number of concurrent operations
 * @returns Array of results
 */
export async function processInParallel<T, R>(
  items: T[],
  processFn: (item: T) => Promise<R>,
  concurrency = 3,
): Promise<R[]> {
  const results: R[] = []
  const pending: Promise<void>[] = []
  const executing: Promise<void>[] = []

  // Process each item with controlled concurrency
  for (const item of items) {
    // Create a promise that processes the item and stores its result
    const p = Promise.resolve().then(async () => {
      const result = await processFn(item)
      results.push(result)
    })

    // Add the promise to our pending list
    pending.push(p)

    // If we already have enough executing promises, wait for one to finish
    if (pending.length >= concurrency) {
      // Move a pending promise to executing
      const e = pending.shift()!
      executing.push(e)

      // If we've reached our concurrency limit, wait for one to finish
      if (executing.length >= concurrency) {
        await Promise.race(executing)
        // Remove completed promises
        for (let i = executing.length - 1; i >= 0; i--) {
          if (executing[i].isFulfilled) {
            executing.splice(i, 1)
          }
        }
      }
    }
  }

  // Wait for all remaining promises to complete
  await Promise.all([...pending, ...executing])

  return results
}

// Add a property to Promise prototype to check if it's fulfilled
// This is a TypeScript declaration to avoid type errors
declare global {
  interface Promise<T> {
    isFulfilled?: boolean
  }
}
