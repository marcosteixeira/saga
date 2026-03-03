'use client'
import { useState } from 'react'

interface SceneImageProps {
  imageUrl: string | null
}

export default function SceneImage({ imageUrl }: SceneImageProps) {
  const [expanded, setExpanded] = useState(true)

  if (!imageUrl) return null

  return (
    <div
      className="relative flex-shrink-0 mb-2 rounded-sm overflow-hidden"
      style={{
        border: '1px solid var(--gunmetal)',
        height: expanded ? '400px' : '64px',
        transition: 'height 300ms ease',
      }}
    >
      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt="Scene"
        className="w-full h-full object-cover"
        style={{ display: 'block' }}
      />

      {/* Vignette overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.4) 100%)',
        }}
      />

      {/* Collapse toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="absolute top-1 right-1 flex items-center justify-center w-6 h-6 rounded-sm text-xs"
        style={{
          background: 'rgba(0,0,0,0.5)',
          color: 'var(--brass)',
          border: '1px solid var(--gunmetal)',
          cursor: 'pointer',
          zIndex: 10,
        }}
        title={expanded ? 'Collapse scene image' : 'Expand scene image'}
      >
        ⚙
      </button>
    </div>
  )
}
