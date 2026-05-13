const PREFIX = '__BETTERDB_VECTOR_BYTES__:';

export function makeVectorPlaceholder(byteLength: number): string {
  return `${PREFIX}${byteLength}`;
}

export function isVectorPlaceholder(value: string): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function parseVectorPlaceholder(value: string): number | null {
  if (!isVectorPlaceholder(value)) return null;
  const n = Number(value.slice(PREFIX.length));
  return Number.isFinite(n) ? n : null;
}
