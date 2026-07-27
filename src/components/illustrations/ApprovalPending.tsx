export function ApprovalPendingIllustration({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="30" y="18" width="60" height="84" rx="8" style={{ fill: 'var(--surface-2)' }} stroke="var(--border-strong)" strokeWidth="1.5" />
      <rect x="48" y="18" width="24" height="10" rx="4" style={{ fill: 'var(--surface)' }} stroke="var(--border-strong)" strokeWidth="1.5" />
      <rect x="42" y="42" width="36" height="4" rx="2" style={{ fill: 'var(--border-strong)' }} />
      <rect x="42" y="52" width="36" height="4" rx="2" style={{ fill: 'var(--border-strong)' }} />
      <rect x="42" y="62" width="24" height="4" rx="2" style={{ fill: 'var(--border-strong)' }} />
      <circle cx="82" cy="86" r="20" style={{ fill: 'var(--warning-soft)' }} stroke="var(--warning)" strokeWidth="2" />
      <path d="M82 76 L82 86 L89 91" stroke="var(--warning)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export function ErrorStateIllustration({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="24" y="24" width="72" height="72" rx="10" style={{ fill: 'var(--danger-soft)' }} stroke="var(--danger)" strokeWidth="2" />
      <line x1="60" y1="42" x2="60" y2="66" stroke="var(--danger)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="60" cy="78" r="2.5" style={{ fill: 'var(--danger)' }} />
    </svg>
  )
}
