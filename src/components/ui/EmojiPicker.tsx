'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'
import { cn } from './cn'

interface EmojiPickerProps {
  value?: string
  onChange: (emoji: string) => void
  className?: string
}

// Telegram bot messages are plain text/HTML -- there's no way to send a
// lucide-react (or any SVG/font) icon inline, so this is the closest
// equivalent to IconPicker.tsx's icon grid: pick from a curated,
// searchable set of emoji instead of a raw lucide icon name. Grouped by
// the kinds of alerts this app actually sends (reports, money, workorders,
// stock, status) rather than every Unicode emoji, same "curated over
// exhaustive" call IconPicker makes with SUGGESTED_ICON_NAMES.
const EMOJI_CATALOG: { emoji: string; name: string; keywords: string }[] = [
  // Reports / analytics
  { emoji: '📊', name: 'bar chart', keywords: 'report analytics stats summary' },
  { emoji: '📈', name: 'trend up', keywords: 'report growth increase revenue' },
  { emoji: '📉', name: 'trend down', keywords: 'report decline decrease loss' },
  { emoji: '🗓️', name: 'calendar', keywords: 'date schedule month week day' },
  { emoji: '📅', name: 'calendar day', keywords: 'date schedule due' },
  { emoji: '⏰', name: 'alarm clock', keywords: 'due reminder time expiry' },
  { emoji: '🧾', name: 'receipt', keywords: 'invoice bill report' },
  // Money / payments
  { emoji: '💰', name: 'money bag', keywords: 'payment revenue credit cash' },
  { emoji: '💵', name: 'banknote', keywords: 'payment cash revenue' },
  { emoji: '💳', name: 'card', keywords: 'payment card upi' },
  { emoji: '🏦', name: 'bank', keywords: 'bank account settlement' },
  { emoji: '💸', name: 'money flying', keywords: 'payout settlement expense' },
  { emoji: '🪙', name: 'coin', keywords: 'wallet balance credit' },
  // Workorders / jobs
  { emoji: '🔧', name: 'wrench', keywords: 'workorder repair service' },
  { emoji: '🛠️', name: 'tools', keywords: 'workorder repair maintenance' },
  { emoji: '📦', name: 'package', keywords: 'stock inventory part order' },
  { emoji: '📱', name: 'mobile', keywords: 'device phone product' },
  { emoji: '🧰', name: 'toolbox', keywords: 'workorder repair jobsheet' },
  // Status / alerts
  { emoji: '✅', name: 'check', keywords: 'success done closed confirmed' },
  { emoji: '⚠️', name: 'warning', keywords: 'alert caution due low' },
  { emoji: '❌', name: 'cross', keywords: 'error failed rejected cancelled' },
  { emoji: 'ℹ️', name: 'info', keywords: 'info general note' },
  { emoji: '🔔', name: 'bell', keywords: 'notification alert reminder' },
  { emoji: '🚨', name: 'siren', keywords: 'urgent alert critical' },
  { emoji: '⭐', name: 'star', keywords: 'featured highlight important' },
  { emoji: '🆕', name: 'new', keywords: 'new workorder created' },
  // People / business
  { emoji: '👤', name: 'person', keywords: 'customer vendor user' },
  { emoji: '🏪', name: 'store', keywords: 'business shop vendor' },
  { emoji: '📞', name: 'phone call', keywords: 'call contact customer' },
  { emoji: '✉️', name: 'envelope', keywords: 'email message' },
  { emoji: '📢', name: 'megaphone', keywords: 'announcement general' },
  { emoji: '🎯', name: 'target', keywords: 'goal target plan' },
  { emoji: '🤝', name: 'handshake', keywords: 'deal agreement partner vendor' },
  { emoji: '👥', name: 'people', keywords: 'team staff group vendor' },
  { emoji: '🧑‍🔧', name: 'engineer', keywords: 'technician repair engineer worker' },
  { emoji: '👨‍💼', name: 'manager', keywords: 'staff business owner' },
  { emoji: '🏢', name: 'office building', keywords: 'business company office' },
  { emoji: '🏭', name: 'factory', keywords: 'business manufacturing' },
  { emoji: '📍', name: 'location pin', keywords: 'address location centre' },
  { emoji: '🌐', name: 'globe', keywords: 'website online general' },
  // Time / scheduling
  { emoji: '🕐', name: 'clock', keywords: 'time schedule due' },
  { emoji: '⏳', name: 'hourglass', keywords: 'pending waiting due' },
  { emoji: '⏱️', name: 'stopwatch', keywords: 'time duration' },
  { emoji: '🔁', name: 'repeat', keywords: 'recurring schedule cycle' },
  { emoji: '🔔', name: 'bell reminder', keywords: 'reminder due notification' },
  // Documents / requests
  { emoji: '📄', name: 'document', keywords: 'invoice bill document form' },
  { emoji: '📋', name: 'clipboard', keywords: 'checklist report list workorder' },
  { emoji: '📝', name: 'memo', keywords: 'note edit form update' },
  { emoji: '🗂️', name: 'folder', keywords: 'catalog records files' },
  { emoji: '📁', name: 'file folder', keywords: 'catalog records files' },
  { emoji: '🔖', name: 'bookmark', keywords: 'reference tag label' },
  { emoji: '📌', name: 'pin', keywords: 'important pinned reminder' },
  { emoji: '📎', name: 'paperclip', keywords: 'attachment document' },
  { emoji: '🧮', name: 'abacus', keywords: 'calculate accounting billing' },
  // Approve / reject / request
  { emoji: '👍', name: 'thumbs up', keywords: 'approved accepted good' },
  { emoji: '👎', name: 'thumbs down', keywords: 'rejected declined bad' },
  { emoji: '✔️', name: 'check mark', keywords: 'done approved success' },
  { emoji: '✖️', name: 'multiplication x', keywords: 'cancelled rejected removed' },
  { emoji: '🚫', name: 'prohibited', keywords: 'blocked denied disabled' },
  { emoji: '🔒', name: 'locked', keywords: 'security restricted disabled' },
  { emoji: '🔓', name: 'unlocked', keywords: 'access enabled open' },
  { emoji: '🆗', name: 'ok', keywords: 'ok confirmed approved' },
  { emoji: '🆕', name: 'new', keywords: 'new created added' },
  { emoji: '🔄', name: 'refresh', keywords: 'update sync in progress' },
  { emoji: '⏸️', name: 'pause', keywords: 'on hold paused part pending' },
  { emoji: '⏹️', name: 'stop', keywords: 'stopped closed ended' },
  { emoji: '⏭️', name: 'skip forward', keywords: 'next step forward' },
  // Levels / priority
  { emoji: '🔴', name: 'red circle', keywords: 'urgent critical danger high' },
  { emoji: '🟠', name: 'orange circle', keywords: 'warning medium priority' },
  { emoji: '🟡', name: 'yellow circle', keywords: 'pending caution low stock' },
  { emoji: '🟢', name: 'green circle', keywords: 'ok good success active' },
  { emoji: '🔵', name: 'blue circle', keywords: 'info general note' },
  { emoji: '⬆️', name: 'up arrow', keywords: 'increase up growth' },
  { emoji: '⬇️', name: 'down arrow', keywords: 'decrease down decline' },
  { emoji: '➡️', name: 'right arrow', keywords: 'next forward continue' },
  { emoji: '🔺', name: 'red triangle up', keywords: 'increase alert up' },
  { emoji: '🔻', name: 'red triangle down', keywords: 'decrease alert down' },
  // Devices / repair (product categories)
  { emoji: '💻', name: 'laptop', keywords: 'device product computer' },
  { emoji: '🖥️', name: 'desktop', keywords: 'device product computer' },
  { emoji: '⌚', name: 'watch', keywords: 'device product smartwatch' },
  { emoji: '🎧', name: 'headphones', keywords: 'device product audio' },
  { emoji: '🔋', name: 'battery', keywords: 'device part battery power' },
  { emoji: '🔌', name: 'plug', keywords: 'device part charger power' },
  { emoji: '💾', name: 'floppy disk', keywords: 'device part storage backup' },
  { emoji: '🖨️', name: 'printer', keywords: 'device product printer' },
  { emoji: '📷', name: 'camera', keywords: 'device product camera' },
  { emoji: '🚗', name: 'car', keywords: 'vehicle delivery pickup' },
  { emoji: '🏍️', name: 'motorcycle', keywords: 'vehicle delivery pickup' },
  { emoji: '🚚', name: 'delivery truck', keywords: 'delivery shipment logistics' },
  // Faces / reactions (for a lighter, more personal tone)
  { emoji: '😀', name: 'smile', keywords: 'happy positive greeting' },
  { emoji: '🙂', name: 'slight smile', keywords: 'happy positive greeting' },
  { emoji: '😃', name: 'grin', keywords: 'happy positive excited' },
  { emoji: '😎', name: 'sunglasses', keywords: 'cool confident nice' },
  { emoji: '🤔', name: 'thinking', keywords: 'pending review considering' },
  { emoji: '😕', name: 'confused', keywords: 'issue problem unclear' },
  { emoji: '😢', name: 'sad', keywords: 'sorry apology issue' },
  { emoji: '😡', name: 'angry', keywords: 'urgent critical complaint' },
  { emoji: '🙏', name: 'folded hands', keywords: 'thank you please request' },
  { emoji: '👋', name: 'wave', keywords: 'hello greeting welcome' },
  { emoji: '🎉', name: 'party popper', keywords: 'celebration success milestone' },
  { emoji: '🎊', name: 'confetti', keywords: 'celebration success milestone' },
  { emoji: '🏆', name: 'trophy', keywords: 'achievement best top performer' },
  { emoji: '🥇', name: 'gold medal', keywords: 'top best rank first' },
  { emoji: '💯', name: 'hundred', keywords: 'perfect complete full success' },
  { emoji: '❤️', name: 'red heart', keywords: 'thanks appreciation loyal' },
  { emoji: '👏', name: 'clapping', keywords: 'congratulations well done' },
  { emoji: '💪', name: 'flexed bicep', keywords: 'strong growth performance' },
  { emoji: '🔥', name: 'fire', keywords: 'hot trending popular urgent' },
  { emoji: '✨', name: 'sparkles', keywords: 'new special highlight' },
  { emoji: '💡', name: 'light bulb', keywords: 'idea tip suggestion note' },
  { emoji: '🎁', name: 'gift', keywords: 'offer reward bonus promotion' },
  { emoji: '🏷️', name: 'label tag', keywords: 'price discount offer tag' },
]

export function EmojiPicker({ value, onChange, className }: EmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    if (!query.trim()) return EMOJI_CATALOG
    const q = query.trim().toLowerCase()
    return EMOJI_CATALOG.filter((e) => e.name.includes(q) || e.keywords.includes(q))
  }, [query])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-2 px-3 py-2 rounded-control border border-border-strong bg-surface text-sm text-ink hover:bg-surface-2 transition-colors',
          className
        )}
      >
        {value ? <span className="text-base leading-none">{value}</span> : <span className="w-4 h-4 rounded border border-dashed border-ink-3" />}
        <span className="text-ink-2">{value || 'Choose icon…'}</span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md max-h-[80vh] flex flex-col rounded-card border border-border bg-surface shadow-card-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 p-4 border-b border-border">
              <Search className="w-4 h-4 text-ink-3 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search icons (report, money, workorder…)"
                className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-3"
              />
              {value && (
                <button type="button" onClick={() => { onChange(''); setOpen(false); setQuery('') }} className="text-xs text-ink-3 hover:text-ink whitespace-nowrap">
                  Clear
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface-2 text-ink-3">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-4 grid grid-cols-6 sm:grid-cols-7 gap-2">
              {results.map((e) => (
                <button
                  key={e.emoji}
                  type="button"
                  title={e.name}
                  onClick={() => { onChange(e.emoji); setOpen(false); setQuery('') }}
                  className={cn(
                    'flex flex-col items-center gap-1 p-2.5 rounded-control border transition-colors',
                    value === e.emoji ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-surface-2'
                  )}
                >
                  <span className="text-xl leading-none">{e.emoji}</span>
                </button>
              ))}
              {results.length === 0 && (
                <p className="col-span-full text-center text-sm text-ink-3 py-8">No icons match "{query}".</p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
