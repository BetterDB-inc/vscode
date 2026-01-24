const TTL_NO_EXPIRY = -1;
const TTL_KEY_NOT_EXISTS = -2;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

export function formatTTL(ttl: number): string {
  if (ttl === TTL_NO_EXPIRY) return 'No expiry';
  if (ttl === TTL_KEY_NOT_EXISTS) return 'Key does not exist';
  if (ttl < SECONDS_PER_MINUTE) return `${ttl}s`;
  if (ttl < SECONDS_PER_HOUR) return `${Math.floor(ttl / SECONDS_PER_MINUTE)}m ${ttl % SECONDS_PER_MINUTE}s`;
  if (ttl < SECONDS_PER_DAY) {
    const hours = Math.floor(ttl / SECONDS_PER_HOUR);
    const minutes = Math.floor((ttl % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
    return `${hours}h ${minutes}m`;
  }
  const days = Math.floor(ttl / SECONDS_PER_DAY);
  const hours = Math.floor((ttl % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  return `${days}d ${hours}h`;
}
