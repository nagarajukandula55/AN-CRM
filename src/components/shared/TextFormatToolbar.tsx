'use client'

import { useState } from 'react'
import { Bold, Italic, Underline, Strikethrough, Link2, Code, List, Pilcrow, EyeOff, Quote, Terminal, Smile } from 'lucide-react'
import { wrapTextareaSelection, insertAtCursor } from '@/lib/wrapTextareaSelection'

export interface FormatButtonDef {
  icon: React.ReactNode
  title: string
  before: string
  after: string
  placeholder?: string
}

// The FULL set of inline tags Telegram's Bot API actually renders in HTML
// parse mode (see https://core.telegram.org/bots/api#html-style) -- every
// one of these, not just the original bold/italic/underline/strike/code/
// link subset. Anything outside this list is either stripped or breaks
// the send outright, so the toolbar deliberately never offers more than
// this, even though it's now the full real list.
export const TELEGRAM_FORMAT_BUTTONS: FormatButtonDef[] = [
  { icon: <Bold size={13} />, title: 'Bold', before: '<b>', after: '</b>', placeholder: 'bold text' },
  { icon: <Italic size={13} />, title: 'Italic', before: '<i>', after: '</i>', placeholder: 'italic text' },
  { icon: <Underline size={13} />, title: 'Underline', before: '<u>', after: '</u>', placeholder: 'underlined text' },
  { icon: <Strikethrough size={13} />, title: 'Strikethrough', before: '<s>', after: '</s>', placeholder: 'struck text' },
  { icon: <EyeOff size={13} />, title: 'Spoiler (tap to reveal)', before: '<span class="tg-spoiler">', after: '</span>', placeholder: 'hidden text' },
  { icon: <Code size={13} />, title: 'Inline code', before: '<code>', after: '</code>', placeholder: 'code' },
  { icon: <Terminal size={13} />, title: 'Code block', before: '<pre><code>', after: '</code></pre>', placeholder: 'multi-line\ncode block' },
  { icon: <Quote size={13} />, title: 'Quote', before: '<blockquote>', after: '</blockquote>', placeholder: 'quoted text' },
  { icon: <Link2 size={13} />, title: 'Link', before: '<a href="https://">', after: '</a>', placeholder: 'link text' },
]

// Email renders full HTML, so its toolbar can go a little further --
// still plain inline tags (no embedded styles/scripts), matching what
// services/email/resend.service.ts sends as-is.
export const EMAIL_FORMAT_BUTTONS: FormatButtonDef[] = [
  { icon: <Bold size={13} />, title: 'Bold', before: '<b>', after: '</b>', placeholder: 'bold text' },
  { icon: <Italic size={13} />, title: 'Italic', before: '<i>', after: '</i>', placeholder: 'italic text' },
  { icon: <Underline size={13} />, title: 'Underline', before: '<u>', after: '</u>', placeholder: 'underlined text' },
  { icon: <Link2 size={13} />, title: 'Link', before: '<a href="https://">', after: '</a>', placeholder: 'link text' },
  { icon: <List size={13} />, title: 'Bullet list', before: '<ul>\n  <li>', after: '</li>\n</ul>', placeholder: 'item' },
  { icon: <Pilcrow size={13} />, title: 'Paragraph', before: '<p>', after: '</p>', placeholder: 'paragraph text' },
]

// A curated, business-relevant emoji set -- not exhaustive (that's what
// the OS/browser's own native emoji picker is for on a real keyboard),
// just fast one-click access to the ones that actually show up in repair-
// shop/alert copy: status, money, tools, warnings, contact, time.
const QUICK_EMOJI = [
  '✅', '❌', '⚠️', '🔔', '📦', '🛠️', '💰', '📅', '⏰', '📍',
  '📞', '✉️', '👋', '🎉', '🔧', '📋', '⭐', '🚀', '💡', '🔒',
]

export default function TextFormatToolbar({
  buttons,
  textareaRef,
  onChange,
  showEmoji = true,
}: {
  buttons: FormatButtonDef[]
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onChange: (nextValue: string) => void
  showEmoji?: boolean
}) {
  const [emojiOpen, setEmojiOpen] = useState(false)

  return (
    <div className="mb-1.5">
      <div className="flex items-center gap-1 flex-wrap relative">
        {buttons.map((b) => (
          <button
            key={b.title}
            type="button"
            title={b.title}
            onClick={() => {
              const el = textareaRef.current
              if (!el) return
              onChange(wrapTextareaSelection(el, b.before, b.after, b.placeholder))
            }}
            className="w-7 h-7 rounded-control border border-border bg-surface flex items-center justify-center text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors"
          >
            {b.icon}
          </button>
        ))}
        {showEmoji && (
          <div className="relative">
            <button
              type="button"
              title="Insert emoji"
              onClick={() => setEmojiOpen((v) => !v)}
              className={`w-7 h-7 rounded-control border flex items-center justify-center transition-colors ${emojiOpen ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink'}`}
            >
              <Smile size={13} />
            </button>
            {emojiOpen && (
              <div className="absolute z-20 top-full left-0 mt-1 grid grid-cols-5 gap-1 p-2 rounded-control border border-border bg-surface shadow-card-lg w-44">
                {QUICK_EMOJI.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      const el = textareaRef.current
                      if (!el) return
                      onChange(insertAtCursor(el, e))
                      setEmojiOpen(false)
                    }}
                    className="text-base w-7 h-7 flex items-center justify-center rounded-control hover:bg-surface-2"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
