import { cn } from './cn'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

/** The title/description/actions block at the top of every list/detail
 * page -- was reimplemented ad hoc per page with drifting font-weight
 * (semibold vs bold) and spacing (see the UI audit). */
export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 mb-8', className)}>
      <div>
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="h-page">{title}</h1>
        {description && <p className="text-sm text-ink-3 mt-1.5 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
