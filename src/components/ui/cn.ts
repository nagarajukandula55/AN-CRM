/** Joins truthy classnames -- no need for the clsx/tailwind-merge
 * dependency for what's just `.filter(Boolean).join(' ')`. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
