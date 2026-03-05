'use client';

import type { Message } from '@/types/message';
import type { Player } from '@/types/player';
import type { ImageModalState } from './ImageModal';
import { formatMessageTimeLocal } from './message-time';

function InlineVision({ imageUrl, onExpand }: { imageUrl: string; onExpand: () => void }) {
  return (
    <button
      onClick={onExpand}
      className="group relative mt-3 block w-full overflow-hidden border border-brass/30 transition-all duration-300 hover:border-brass/70"
      style={{
        clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
        boxShadow: '0 0 20px rgba(196,148,61,0.08)',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" className="block h-44 w-full object-cover transition-transform duration-500 group-hover:scale-[1.02] sm:h-56" />
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ background: 'linear-gradient(0deg, rgba(13,12,10,0.6) 0%, rgba(13,12,10,0.1) 50%, transparent 100%)' }}
      />
      <div
        className="absolute bottom-3 right-3 flex items-center gap-1.5 border border-brass/50 bg-soot/70 px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)', backdropFilter: 'blur(4px)' }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 9L9 1M9 1H4M9 1V6" stroke="var(--brass)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[9px] uppercase tracking-[0.15em] text-brass" style={{ fontFamily: 'var(--font-mono), monospace' }}>View</span>
      </div>
      <div
        className="absolute left-3 top-3 flex h-5 items-center gap-1.5 border border-brass/40 bg-soot/80 px-2"
        style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 4px) 100%, 0 100%)', backdropFilter: 'blur(4px)' }}
      >
        <div className="h-1.5 w-1.5 rounded-full bg-amber" style={{ boxShadow: '0 0 4px var(--amber)' }} />
        <span className="text-[9px] uppercase tracking-[0.2em] text-brass" style={{ fontFamily: 'var(--font-mono), monospace' }}>Vision</span>
      </div>
    </button>
  );
}

function renderNarrationContent(content: string) {
  const chunks: React.ReactNode[] = [];
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of content.matchAll(tokenRegex)) {
    const token = match[0];
    const start = match.index ?? 0;

    if (start > cursor) {
      chunks.push(content.slice(cursor, start));
    }

    if (token.startsWith('**') && token.endsWith('**')) {
      chunks.push(
        <strong key={`bold-${tokenIndex}`} style={{ color: 'var(--brass)' }}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      chunks.push(
        <em key={`italic-${tokenIndex}`} style={{ color: 'var(--steam)', opacity: 0.9 }}>
          {token.slice(1, -1)}
        </em>,
      );
    }

    cursor = start + token.length;
    tokenIndex += 1;
  }

  if (cursor < content.length) {
    chunks.push(content.slice(cursor));
  }

  return chunks;
}

export function MessageBubble({ message, players, onImageClick }: { message: Message; players: Player[]; onImageClick: (state: ImageModalState) => void }) {
  const player = players.find((p) => p.id === message.player_id);

  if (message.type === 'system') {
    return (
      <div className="flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-gunmetal/60" />
        <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-ash/60" style={{ fontFamily: 'var(--font-mono), monospace' }}>{message.content}</span>
        <div className="h-px flex-1 bg-gunmetal/60" />
      </div>
    );
  }

  if (message.type === 'narration') {
    return (
      <div className="group relative">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-5 items-center gap-1.5 border border-brass/40 bg-brass/10 px-2" style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 4px) 100%, 0 100%)' }}>
            <div className="h-1.5 w-1.5 rounded-full bg-amber" style={{ boxShadow: '0 0 4px var(--amber)' }} />
            <span className="text-[9px] uppercase tracking-[0.2em] text-brass" style={{ fontFamily: 'var(--font-mono), monospace' }}>Game Master</span>
          </div>
          <div className="h-px flex-1 bg-gradient-to-r from-brass/20 to-transparent" />
        </div>
        <div className="border-l-2 border-brass/30 py-1 pl-4 pr-2" style={{ borderImage: 'linear-gradient(to bottom, var(--brass), transparent) 1' }}>
          <p className="text-base leading-loose text-steam sm:text-lg sm:leading-loose" style={{ fontFamily: 'var(--font-body), sans-serif', letterSpacing: '0.01em' }}>
            {renderNarrationContent(message.content)}
          </p>
          {message.image_url && (
            <InlineVision
              imageUrl={message.image_url}
              onExpand={() => onImageClick({ url: message.image_url!, caption: undefined })}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3 pl-2 sm:pl-4">
      <div
        className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center border border-gunmetal bg-smog text-xs font-bold text-ash"
        style={{ clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)', fontFamily: 'var(--font-display), sans-serif' }}
      >
        {((player?.character_name ?? player?.username ?? '?')[0]).toUpperCase()}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-copper" style={{ fontFamily: 'var(--font-mono), monospace' }}>
            {player?.character_name ?? player?.username ?? 'Unknown'}
          </span>
          <span className="text-[9px] text-ash/40" style={{ fontFamily: 'var(--font-mono), monospace' }}>
            {formatMessageTimeLocal(message.created_at)}
          </span>
        </div>
        <p className="text-base italic leading-loose text-steam/80 sm:text-lg" style={{ fontFamily: 'var(--font-body), sans-serif', letterSpacing: '0.01em' }}>{message.content}</p>
      </div>
    </div>
  );
}
