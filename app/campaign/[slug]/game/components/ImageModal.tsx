'use client';

import { useEffect, useState } from 'react';

export interface ImageModalState {
  url: string;
  caption?: string;
  isVisionReveal?: boolean;
}

export function ImageModal({ modal, onClose }: { modal: ImageModalState; onClose: () => void }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [irisOpen, setIrisOpen] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  // Iris reveal after image loads
  useEffect(() => {
    if (!imgLoaded) return;
    const t1 = setTimeout(() => setIrisOpen(true), 60);
    const t2 = setTimeout(() => setContentVisible(true), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [imgLoaded]);

  // Fallback if image never fires onLoad
  useEffect(() => {
    const t1 = setTimeout(() => setIrisOpen(true), 400);
    const t2 = setTimeout(() => setContentVisible(true), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 500);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-soot"
      style={{ opacity: closing ? 0 : 1, transition: closing ? 'opacity 0.5s ease' : 'none' }}
      onClick={handleClose}
    >
      {/* Full-bleed image with iris reveal */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          clipPath: irisOpen ? 'circle(120% at 50% 50%)' : 'circle(5vmin at 50% 50%)',
          transition: irisOpen ? 'clip-path 2s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={modal.url}
          alt={modal.caption ?? 'Campaign vision'}
          onLoad={() => setImgLoaded(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>

      {/* Atmospheric gradient overlays */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1/3"
        style={{
          background: 'linear-gradient(180deg, rgba(13,12,10,0.85) 0%, transparent 100%)',
          opacity: contentVisible ? 1 : 0,
          transition: 'opacity 1s ease',
        }}
      />
      {/* Ember glow at bottom */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 100%, rgba(212,98,42,0.18) 0%, transparent 70%)',
          opacity: contentVisible ? 1 : 0,
          transition: 'opacity 1.5s ease',
        }}
      />

      {/* Vision label — top center */}
      {modal.isVisionReveal && (
        <div
          className="absolute inset-x-0 top-8 flex items-center justify-center gap-4"
          style={{
            opacity: contentVisible ? 1 : 0,
            transform: contentVisible ? 'translateY(0)' : 'translateY(-8px)',
            transition: 'opacity 0.8s ease, transform 0.8s ease',
          }}
        >
          <div className="h-px w-12 bg-gradient-to-r from-transparent to-brass/70 sm:w-20" />
          <span
            className="text-[10px] uppercase tracking-[0.4em] text-brass/90"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            Vision Received
          </span>
          <div className="h-px w-12 bg-gradient-to-l from-transparent to-brass/70 sm:w-20" />
        </div>
      )}

      {/* Bottom content: caption + dismiss */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-5 pb-10 sm:pb-14"
        style={{
          opacity: contentVisible ? 1 : 0,
          transform: contentVisible ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.9s ease 0.1s, transform 0.9s cubic-bezier(0.16,1,0.3,1) 0.1s',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {modal.caption && (
          <p
            className="max-w-lg px-6 text-center text-sm italic text-steam/75 sm:text-base"
            style={{ fontFamily: 'var(--font-body), sans-serif' }}
          >
            {modal.caption}
          </p>
        )}

        <button
          onClick={handleClose}
          className="group flex items-center gap-3 border border-gunmetal bg-soot/60 px-6 py-2.5 text-[10px] uppercase tracking-[0.3em] text-ash/80 transition-all duration-300 hover:border-brass/60 hover:text-brass active:scale-95"
          style={{
            fontFamily: 'var(--font-mono), monospace',
            clipPath: 'polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <span>{modal.isVisionReveal ? 'Dismiss Vision' : 'Close'}</span>
          <span className="text-gunmetal group-hover:text-brass/50 transition-colors duration-300">ESC</span>
        </button>
      </div>
    </div>
  );
}
