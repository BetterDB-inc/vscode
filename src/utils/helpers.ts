export { formatTTL } from '../shared/formatters';

export function generateId(): string {
  return `conn-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function arrayToObject(arr: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < arr.length; i += 2) {
    obj[arr[i]] = arr[i + 1];
  }
  return obj;
}

export function parseRedisInfo(info: string): Record<string, string> {
  const lines = info.split('\r\n');
  const parsed: Record<string, string> = {};
  for (const line of lines) {
    if (line.startsWith('#') || !line.includes(':')) {
      continue;
    }
    const colonIndex = line.indexOf(':');
    const key = line.substring(0, colonIndex);
    const value = line.substring(colonIndex + 1);
    if (key && value !== undefined) {
      parsed[key] = value;
    }
  }
  return parsed;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
