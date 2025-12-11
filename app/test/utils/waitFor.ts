/**
 * Polls until `fn` stops throwing or returns a truthy value.
 * Rejects if timeout elapses first.
 */
export async function waitFor<T>(
  fn: () => Promise<T> | T,
  {
    timeout = 15_000,
    interval = 100, // adjust as needed
  }: { timeout?: number; interval?: number } = {},
): Promise<T> {
  const start = Date.now()

  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        const result = await fn()
        resolve(result)
      } catch (err) {
        if (Date.now() - start >= timeout) {
          reject(err)
        } else {
          setTimeout(attempt, interval)
        }
      }
    }

    attempt()
  })
}
