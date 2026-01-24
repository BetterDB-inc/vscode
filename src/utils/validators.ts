const MIN_PORT = 1;
const MAX_PORT = 65535;
const MIN_DB_INDEX = 0;
const MAX_DB_INDEX = 255;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePort(value: string): ValidationResult {
  const port = parseInt(value, 10);
  if (isNaN(port) || port < MIN_PORT || port > MAX_PORT) {
    return { valid: false, error: `Port must be between ${MIN_PORT} and ${MAX_PORT}` };
  }
  return { valid: true };
}

export function validateDbIndex(value: string): ValidationResult {
  const db = parseInt(value, 10);
  if (isNaN(db) || db < MIN_DB_INDEX || db > MAX_DB_INDEX) {
    return { valid: false, error: `Database index must be between ${MIN_DB_INDEX} and ${MAX_DB_INDEX}` };
  }
  return { valid: true };
}

export function validateConnectionName(value: string): ValidationResult {
  if (!value || !value.trim()) {
    return { valid: false, error: 'Name is required' };
  }
  return { valid: true };
}

export function validateHost(value: string): ValidationResult {
  if (!value || !value.trim()) {
    return { valid: false, error: 'Host is required' };
  }
  return { valid: true };
}

export function validateConnectionConfig(config: {
  name: string;
  host: string;
  port: number;
  db?: number;
}): ValidationResult {
  const nameResult = validateConnectionName(config.name);
  if (!nameResult.valid) return nameResult;

  const hostResult = validateHost(config.host);
  if (!hostResult.valid) return hostResult;

  const portResult = validatePort(String(config.port));
  if (!portResult.valid) return portResult;

  if (config.db !== undefined) {
    const dbResult = validateDbIndex(String(config.db));
    if (!dbResult.valid) return dbResult;
  }

  return { valid: true };
}
