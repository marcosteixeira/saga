'use client';

import { useEffect, useState } from 'react';

export interface ImageModalState {
  url: string;
  caption?: string;
  isVisionReveal?: boolean;
}

export function ImageModal({ modal, onClose }: { modal: ImageModalState; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(13,12,10,0.95)', opacity: visible ? 1 : 0, transition: 'opacity 0.4s' }}
      onClick={onClose}
    >
      <div
        className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-4 sm:gap-6"
        style={{ transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.98)', transition: 'transform 0.4s cubic-bezier(0.16,1,0.3,1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {modal.isVisionReveal && (
          <div className="flex items-center gap-4">
            <div className="h-px w-10 bg-gradient-to-r from-transparent to-brass sm:w-16" />
            <span className="text-xs uppercase tracking-[0.35em] text-brass" style={{ fontFamily: 'var(--font-mono), monospace' }}>
              Vision Received
            </span>
            <div className="h-px w-10 bg-gradient-to-l from-transparent to-brass sm:w-16" />
          </div>
        )}

        <div
          className="relative w-full overflow-hidden border-2 border-brass/60"
          style={{
            clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
            boxShadow: '0 0 80px rgba(196,148,61,0.2), inset 0 0 40px rgba(13,12,10,0.4)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={modal.url} alt="Campaign vision" className="block max-h-[60vh] w-full object-cover sm:max-h-[70vh]" />
          <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(13,12,10,0.4) 0%, transparent 35%)' }} />
          {['top-1 left-1', 'top-1 right-1', 'bottom-1 left-1', 'bottom-1 right-1'].map((pos) => (
            <div key={pos} className={`absolute ${pos} h-3 w-3 rounded-full border border-brass/60`} style={{ background: 'radial-gradient(circle at 30% 30%, var(--brass), var(--gunmetal))' }} />
          ))}
        </div>

        {modal.caption && (
          <p className="px-4 text-center text-sm italic text-steam/70" style={{ fontFamily: 'var(--font-body), sans-serif' }}>
            {modal.caption}
          </p>
        )}

        <button
          onClick={onClose}
          className="border border-gunmetal bg-iron px-6 py-2 text-xs uppercase tracking-[0.2em] text-ash transition-all duration-300 hover:border-brass hover:text-brass active:scale-95"
          style={{ fontFamily: 'var(--font-mono), monospace', clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }}
        >
          {modal.isVisionReveal ? 'Dismiss Vision' : 'Close'}
        </button>
      </div>
    </div>
  );
}
