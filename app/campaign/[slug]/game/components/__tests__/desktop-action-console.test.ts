import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DesktopActionConsole } from '../../GameClient';

describe('DesktopActionConsole', () => {
  it('renders manual action controls without preset suggestion buttons', () => {
    const markup = renderToStaticMarkup(
      React.createElement(DesktopActionConsole, {
        value: '',
        onChange: vi.fn(),
        onSend: vi.fn(),
      }),
    );

    expect(markup).toContain('Describe your action or speak in character...');
    expect(markup).toContain('Transmit');
    expect(markup).not.toContain('Look around');
    expect(markup).not.toContain('Attack');
    expect(markup).not.toContain('Roll for initiative');
    expect(markup).not.toContain('Speak to NPC');
    expect(markup).not.toContain('Search area');
  });
});
