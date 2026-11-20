export function mobileNavigationLayout(count: number): { columns: number; rows: number } {
  const columns = count <= 5 ? Math.max(1, count) : count === 6 ? 3 : 4
  return { columns, rows: Math.ceil(count / columns) }
}
