import { describe, expect, it } from 'vitest';
import { createVoiceNarrationController } from '../voice-narration-controller';

describe('createVoiceNarrationController', () => {
  it('cancels an in-flight speak request when narration is disabled', () => {
    const controller = createVoiceNarrationController();

    const requestId = controller.beginRequest();
    expect(controller.shouldProcess(requestId)).toBe(true);

    controller.setEnabled(false);

    expect(controller.shouldProcess(requestId)).toBe(false);
  });

  it('invalidates older requests when a new narration starts', () => {
    const controller = createVoiceNarrationController();

    const firstRequest = controller.beginRequest();
    const secondRequest = controller.beginRequest();

    expect(controller.shouldProcess(firstRequest)).toBe(false);
    expect(controller.shouldProcess(secondRequest)).toBe(true);
  });
});
