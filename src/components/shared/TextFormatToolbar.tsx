'use client'

import { Bold, Italic, Underline, Strikethrough, Link2, Code, List, Pilcrow } from 'lucide-react'
import { wrapTextareaSelection } from '@/lib/wrapTextareaSelection'

export interface FormatButtonDef {
  icon: React.ReactNode
  title: string
  before: string
  after: string
  placeholder?: string
}

// Telegram (and WhatsApp, same subset in practice) only understands a
// handful of inline HTML tags -- b/i/u/s/code/pre/a -- anything else is
// either stripped or breaks the send outright, so its toolbar is
// deliberately narrower than email's.
export const TELEGRAM_FORMAT_BUTTONS: FormatButtonDef[] = [
  { icon: <Bold size={13} />, title: 'Bold', before: '<b>', after: '</b>', placeholder: 'bold text' },
  { icon: <Italic size={13} />, title: 'Italic', before: '<i>', after: '</i>', placeholder: 'italic text' },
  { icon: <Underline size={13} />, title: 'Underline', before: '<u>', after: '</u>', placeholder: 'underlined text' },
  { icon: <Strikethrough size={13} />, title: 'Strikethrough', before: '<s>', after: '</s>', placeholder: 'struck text' },
  { icon: <Code size={13} />, title: 'Code', before: '<code>', after: '</code>', placeholder: 'code' },
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

export default function TextFormatToolbar({
  buttons,
  textareaRef,
  onChange,
}: {
  buttons: FormatButtonDef[]
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onChange: (nextValue: string) => void
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap mb-1.5">
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
    </div>
  )
}
