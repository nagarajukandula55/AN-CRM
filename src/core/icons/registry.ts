/**
 * Full lucide-react icon catalog (1594 icons as of the installed version)
 * as a name -> component map, plus a couple of curated subsets so the
 * IconPicker/Icon Library page can show "commonly used" first instead of
 * dumping an alphabetical wall of 1594 icons on first open.
 */
import { icons, type LucideIcon } from 'lucide-react'

export const ICON_NAMES: string[] = Object.keys(icons).sort()

export function getIcon(name: string | undefined | null): LucideIcon | null {
  if (!name) return null
  return icons[name as keyof typeof icons] || null
}

// A starting set biased toward what this app's own nav/module list and CRM
// domain actually uses -- shown before the user types a search query.
// Filtered against the installed icons map -- lucide-react renames/removes
// icons between majors (e.g. BarChart3 -> ChartBar, CheckCircle2 ->
// CircleCheck, AlertTriangle -> TriangleAlert in this version), and an
// unfiltered stale name here renders `null` as a component and crashes the
// page (this broke the production build once already).
const RAW_SUGGESTED = [
  'LayoutDashboard', 'Package', 'ShoppingCart', 'TrendingUp', 'DollarSign',
  'Users', 'UserCheck', 'Signature', 'Share2', 'Sparkles', 'Plug',
  'Shield', 'Bell', 'MessageSquare', 'Wrench', 'ClipboardList', 'Phone',
  'Calendar', 'MapPin', 'Building2', 'Truck', 'Boxes', 'Receipt',
  'FileText', 'CreditCard', 'ChartBar', 'Settings', 'Tag', 'Star',
  'CircleCheck', 'TriangleAlert', 'Clock', 'Printer', 'Download',
];
export const SUGGESTED_ICON_NAMES: string[] = RAW_SUGGESTED.filter((n) => n in icons);
