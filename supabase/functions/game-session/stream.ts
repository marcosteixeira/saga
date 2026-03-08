export type StreamEvent = {
  type: string
  delta?: string
  response?: { output_text?: string | null; id: string }
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
      const completedOutput = event.response.output_text
      if (typeof completedOutput === "string" && completedOutput.length > 0) {
        fullText = completedOutput
      }
      newResponseId = event.response.id
    }
  }

  return { fullText, newResponseId }
}
