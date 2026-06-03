export const now = () => Date.now();

export function createId(prefix?: string): string {
  const id = `${now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prefix ? `${prefix}-${id}` : id;
}
