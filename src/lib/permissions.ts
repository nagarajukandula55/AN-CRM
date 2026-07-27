export function hasAccess(
  accessKeys: string[],
  permission: string
) {
  return accessKeys.includes(permission);
}
