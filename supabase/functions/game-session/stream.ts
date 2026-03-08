export type StreamEvent = {
  type: string
  delta?: string
  response?: { output_text: string; id: string }
}

export async function consumeStream(
  campaignId: string,
  stream: AsyncIterable<StreamEvent>,
  onChunk: (campaignId: string, chunk: string) => void,
  onChunkLog: (campaignId: string, chunkLength: number) => void,
  silent = false,
): Promise<{ fullText: string; newResponseId: string }> {
  let fullText = ""
  let newResponseId = ""
  let chunkCount = 0

  for await (const event of stream) {
    if (event.type === "response.output_text.delta" && event.delta) {
      fullText += event.delta
      if (!silent) {
        onChunk(campaignId, event.delta)
      }
      chunkCount++
      if (chunkCount % 20 === 0) {
        onChunkLog(campaignId, event.delta.length)
      }
    }
    if (event.type === "response.completed" && event.response) {
      // output_text is a computed getter on the SDK Response class, not a plain JSON
      // property — accessing it on the raw streaming event object returns undefined.
      // The delta events already accumulate the complete text, so we only take the id.
      newResponseId = event.response.id
    }
  }

  return { fullText, newResponseId }
}
