export function appendStreamingContent(
  streamingRef: { current: string },
  currentContent: string,
  chunk: string
) {
  const nextContent = currentContent + chunk;
  streamingRef.current = nextContent;
  return nextContent;
}
