export interface VoiceNarrationController {
  beginRequest: () => number;
  setEnabled: (enabled: boolean) => void;
  shouldProcess: (requestId: number) => boolean;
}

export function createVoiceNarrationController(): VoiceNarrationController {
  let enabled = true;
  let activeRequestId = 0;

  return {
    beginRequest() {
      activeRequestId += 1;
      return activeRequestId;
    },
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      if (!nextEnabled) {
        activeRequestId += 1;
      }
    },
    shouldProcess(requestId) {
      return enabled && requestId === activeRequestId;
    }
  };
}
