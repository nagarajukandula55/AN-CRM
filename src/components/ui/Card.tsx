import { cn } from './cn'

/** The one card/panel shell -- rounded-card everywhere a container groups
 * content, instead of rounded-xl in one file and rounded-2xl in the next
 * for the same visual role (see the UI audit). */
export function Card({ className, children, onClick }: { className?: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <div className={cn('rounded-card border border-border bg-surface shadow-card', className)} onClick={onClick}>
      {children}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('p-6', className)}>{children}</div>
}
