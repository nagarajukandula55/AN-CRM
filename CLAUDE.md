# AN Group — project conventions

## Design system (required for all new/edited pages)

This app has a shared design system — use it instead of hand-rolled Tailwind
classes (`bg-gray-50`, `rounded-xl`, `bg-indigo-600`, etc.) for any new page
or any page you touch. This was retrofitted across 40+ pages; new code that
doesn't use it re-introduces the exact inconsistency that pass fixed.

**Tokens** (`src/app/globals.css`, `tailwind.config.ts`):
- Backgrounds: `bg-bg` (page), `bg-surface` (cards), `bg-surface-2` / `bg-surface-3` (nested/hover)
- Text: `text-ink` (primary), `text-ink-2` (secondary), `text-ink-3` (muted/labels)
- Borders: `border-border`, `border-border-strong`
- Accent (brand): `bg-accent` / `text-accent` / `bg-accent-soft`, hover `bg-accent-hover`
- Semantic: `success` / `warning` / `danger` / `info`, each with a `-soft` background variant
- Radius: `rounded-control` (buttons/inputs/badges), `rounded-card` (cards/modals) — never `rounded-lg`/`rounded-xl`/`rounded-2xl` directly
- Typography: `.h-page` (page title), `.h-section` (card/section title), `.eyebrow` (small caps label), `.tabular` (for any column of numbers/IDs/amounts)
- Shadows: `shadow-card`, `shadow-card-lg`

**Components** (`src/components/ui/`): `Button`, `Input` / `Select` / `Textarea` / `Field`, `Card` / `CardBody`, `Badge` (tone: success/warning/danger/info/neutral), `Spinner` / `LoadingPanel`, `PageHeader` (eyebrow/title/description/actions), `EmptyState` (kind: empty/search/pending/error, with illustration).

**Icons**: `lucide-react` only. Full catalog + picker at `src/core/icons/registry.ts` / `src/components/ui/IconPicker.tsx`; browse at `/admin/icon-library`.

**Pattern for a typical page:**
```tsx
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingPanel } from '@/components/ui/Spinner'

<div className="min-h-screen bg-bg text-ink">
  <PageHeader title="..." description="..." actions={<Button>...</Button>} />
  {loading ? <LoadingPanel label="Loading…" /> : items.length === 0 ? (
    <EmptyState kind="empty" title="No items found" />
  ) : (
    <Card className="overflow-hidden">{/* table/list */}</Card>
  )}
</div>
```

Modals: `fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40` backdrop, `bg-surface border border-border rounded-card` panel, `Field`/`Input`/`Select` for form fields, `Button` for actions.

**Do not** introduce a new accent color, a new radius value, or a hand-rolled status pill — extend the token set in `globals.css`/`tailwind.config.ts` instead if something is genuinely missing, so it stays one source of truth.

All pages in the app have been migrated to this design system. There is no
remaining hand-rolled-Tailwind baseline to fall back to — every new page must
follow the pattern above from the start.
