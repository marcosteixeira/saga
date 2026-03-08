export type StreamEvent = {
  type: string
  delta?: {
    type: string
    text?: string
  }
}

export async function consumeStream(
  campaignId: string,
  stream: AsyncIterable<StreamEvent>,
  onChunk: (campaignId: string, chunk: string) => void,
  onChunkLog: (campaignId: string, chunkLength: number) => void,
  silent = false,
): Promise<{ fullText: string }> {
  let fullText = ""
  let chunkCount = 0

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta?.type === "text_delta" &&
      event.delta.text
    ) {
      fullText += event.delta.text
      if (!silent) {
        onChunk(campaignId, event.delta.text)
      }
      chunkCount++
      if (chunkCount % 20 === 0) {
        onChunkLog(campaignId, event.delta.text.length)
      }
    }
  }

  return { fullText }
}
