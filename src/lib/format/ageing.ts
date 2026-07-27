/**
 * How long ago something was created, for "how stale is this" badges
 * (CRM Calls/Job Sheets lists, job sheet detail page). Was always shown
 * in whole days ("0d"), which is meaningless for anything created within
 * the last 24 hours -- everything looked like "0d" whether it was 5
 * minutes or 23 hours old. Under 24h shows hours/minutes; 24h or more
 * switches to days, matching the overdue thresholds (2d/7d) those badges
 * already flag on.
 */
export function formatAgeing(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime()
  const totalMinutes = Math.floor(ms / 60000)
  if (totalMinutes < 60 * 24) {
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }
  const days = Math.floor(totalMinutes / (60 * 24))
  return `${days}d`
}
