'use client';

import { useState } from 'react';

export function MobileActionBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="fixed inset-x-0 z-20 border-t border-gunmetal bg-iron/90 lg:hidden" style={{ bottom: '56px', backdropFilter: 'blur(8px)' }}>
      <div className="flex items-end gap-2 p-3">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => {
            setExpanded(true);
            e.target.style.borderColor = 'var(--brass)';
          }}
          onBlur={(e) => {
            setExpanded(false);
            e.target.style.borderColor = 'var(--gunmetal)';
          }}
          placeholder="Describe your action..."
          rows={expanded ? 3 : 1}
          className="flex-1 resize-none bg-smog/80 px-3 py-2 text-sm text-steam/90 placeholder:text-ash/40 focus:outline-none"
          style={{
            fontFamily: 'var(--font-body), sans-serif',
            border: '1px solid var(--gunmetal)',
            clipPath: 'polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)',
            transition: 'border-color 0.2s',
          }}
        />
        <button
          className="flex h-10 w-10 shrink-0 items-center justify-center text-soot active:scale-95"
          style={{
            background: 'linear-gradient(135deg, var(--copper), var(--brass))',
            clipPath: 'polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M14 8L2 2l3 6-3 6 12-6z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
