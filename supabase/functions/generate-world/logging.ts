type LogMeta = Record<string, unknown>

type NormalizedError = {
  name: string
  message: string
  stack?: string
}

function normalizeError(err: unknown): NormalizedError {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    }
  }

  return {
    name: "UnknownError",
    message: String(err),
  }
}

export function logInfo(event: string, meta: LogMeta = {}): void {
  console.log(
    JSON.stringify({
      level: "info",
      event,
      ...meta,
    }),
  )
}

export function logError(event: string, meta: LogMeta = {}, err: unknown): void {
  console.error(
    JSON.stringify({
      level: "error",
      event,
      ...meta,
      error: normalizeError(err),
    }),
  )
}
