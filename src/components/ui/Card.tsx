import Link from 'next/link'
import { cn } from './cn'

const interactiveClass =
  'transition-shadow hover:shadow-card-lg hover:border-border-strong cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2'

/** The one card/panel shell -- rounded-card everywhere a container groups
 * content, instead of rounded-xl in one file and rounded-2xl in the next
 * for the same visual role (see the UI audit).
 *
 * Pass `href` for a real link (correct semantics, right-click/open-in-new-tab
 * support) or `onClick` for a click handler -- either makes the card
 * interactive (hover/focus affordance, keyboard-operable). With neither, it
 * stays a plain non-interactive div, unchanged from before. */
export function Card({
  className,
  children,
  onClick,
  href,
}: {
  className?: string
  children: React.ReactNode
  onClick?: () => void
  href?: string
}) {
  const base = 'rounded-card border border-border bg-surface shadow-card'

  if (href) {
    return (
      <Link href={href} className={cn(base, interactiveClass, 'block', className)}>
        {children}
      </Link>
    )
  }

  if (onClick) {
    return (
      <div
        className={cn(base, interactiveClass, className)}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
      >
        {children}
      </div>
    )
  }

  return <div className={cn(base, className)}>{children}</div>
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('p-6', className)}>{children}</div>
}
