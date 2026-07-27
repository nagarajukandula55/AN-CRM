import { EmptyBoxIllustration } from '@/components/illustrations/EmptyBox'
import { NoResultsIllustration } from '@/components/illustrations/NoResults'
import { ApprovalPendingIllustration, ErrorStateIllustration } from '@/components/illustrations/ApprovalPending'

type Kind = 'empty' | 'search' | 'pending' | 'error'

const ILLUSTRATIONS: Record<Kind, (props: { size?: number }) => React.ReactElement> = {
  empty: EmptyBoxIllustration,
  search: NoResultsIllustration,
  pending: ApprovalPendingIllustration,
  error: ErrorStateIllustration,
}

interface EmptyStateProps {
  kind?: Kind
  title: string
  description?: string
  action?: React.ReactNode
}

/** Consistent "nothing to show" treatment -- illustration + title +
 * description + optional action, one component instead of every list page
 * writing its own ad hoc "No data." <td> (see the UI audit). */
export function EmptyState({ kind = 'empty', title, description, action }: EmptyStateProps) {
  const Illustration = ILLUSTRATIONS[kind]
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <Illustration size={104} />
      <h3 className="h-section mt-4">{title}</h3>
      {description && <p className="text-sm text-ink-3 mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
