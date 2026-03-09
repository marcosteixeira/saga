import { describe, expect, it } from 'vitest';
import { appendStreamingContent } from '../streaming-content';

describe('appendStreamingContent', () => {
  it('updates the ref synchronously with the accumulated narration', () => {
    const streamingRef = { current: '' };

    const first = appendStreamingContent(streamingRef, '', 'The forge ');
    expect(first).toBe('The forge ');
    expect(streamingRef.current).toBe('The forge ');

    const second = appendStreamingContent(streamingRef, first, 'roars awake.');
    expect(second).toBe('The forge roars awake.');
    expect(streamingRef.current).toBe('The forge roars awake.');
  });
});
