'use client'
import { useState, useRef } from 'react'

interface ActionInputProps {
  onSubmit: (content: string) => void
  disabled?: boolean
  placeholder?: string
}

export default function ActionInput({
  onSubmit,
  disabled = false,
  placeholder = 'Describe your action...',
}: ActionInputProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSubmit() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    // Auto-grow up to 3 lines (~72px)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 72) + 'px'
  }

  return (
    <div
      className="flex items-end gap-2 px-3 py-2 rounded-sm"
      style={{ border: '2px solid var(--copper)', background: 'var(--iron)' }}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        className="flex-1 resize-none bg-transparent outline-none text-sm"
        style={{
          fontFamily: 'var(--font-body), sans-serif',
          color: disabled ? 'var(--ash)' : 'var(--steam)',
          caretColor: 'var(--brass)',
          border: '1px solid var(--gunmetal)',
          borderRadius: '2px',
          padding: '6px 8px',
          background: 'var(--iron)',
          minHeight: '36px',
          maxHeight: '72px',
          lineHeight: '1.4',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => { if (!disabled) e.target.style.borderColor = 'var(--brass)'; e.target.style.boxShadow = '0 0 6px rgba(196,148,61,0.35)' }}
        onBlur={e => { e.target.style.borderColor = 'var(--gunmetal)'; e.target.style.boxShadow = 'none' }}
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !text.trim()}
        className="flex-shrink-0 flex items-center justify-center px-3 py-2 rounded-sm text-sm font-semibold transition-all"
        style={{
          background: disabled || !text.trim() ? 'var(--gunmetal)' : 'var(--brass)',
          color: disabled || !text.trim() ? 'var(--ash)' : 'var(--soot)',
          fontFamily: 'var(--font-body), sans-serif',
          border: 'none',
          cursor: disabled || !text.trim() ? 'not-allowed' : 'pointer',
          minWidth: '48px',
          height: '36px',
          clipPath: 'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)',
        }}
        title="Send (Enter)"
      >
        ⟶
      </button>
    </div>
  )
}
