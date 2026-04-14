import { describe, it, expect } from 'vitest';
import {
  validatePort,
  validateDbIndex,
  validateConnectionName,
  validateHost,
  validateConnectionConfig,
  validateTTLInput,
} from './validators';

describe('validatePort', () => {
  it('accepts valid ports', () => {
    expect(validatePort('1')).toEqual({ valid: true });
    expect(validatePort('80')).toEqual({ valid: true });
    expect(validatePort('443')).toEqual({ valid: true });
    expect(validatePort('6379')).toEqual({ valid: true });
    expect(validatePort('65535')).toEqual({ valid: true });
  });

  it('rejects port below minimum', () => {
    const result = validatePort('0');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('between 1 and 65535');
  });

  it('rejects port above maximum', () => {
    const result = validatePort('65536');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('between 1 and 65535');
  });

  it('rejects non-numeric input', () => {
    expect(validatePort('abc').valid).toBe(false);
    expect(validatePort('').valid).toBe(false);
  });

  it('truncates decimal input to integer', () => {
    expect(validatePort('12.34')).toEqual({ valid: true });
    expect(validatePort('6379.99')).toEqual({ valid: true });
  });

  it('rejects negative ports', () => {
    expect(validatePort('-1').valid).toBe(false);
    expect(validatePort('-6379').valid).toBe(false);
  });
});

describe('validateDbIndex', () => {
  it('accepts valid database indices', () => {
    expect(validateDbIndex('0')).toEqual({ valid: true });
    expect(validateDbIndex('1')).toEqual({ valid: true });
    expect(validateDbIndex('15')).toEqual({ valid: true });
    expect(validateDbIndex('255')).toEqual({ valid: true });
  });

  it('rejects index below minimum', () => {
    const result = validateDbIndex('-1');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('between 0 and 255');
  });

  it('rejects index above maximum', () => {
    const result = validateDbIndex('256');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('between 0 and 255');
  });

  it('rejects non-numeric input', () => {
    expect(validateDbIndex('abc').valid).toBe(false);
    expect(validateDbIndex('').valid).toBe(false);
  });
});

describe('validateConnectionName', () => {
  it('accepts valid names', () => {
    expect(validateConnectionName('Local Valkey')).toEqual({ valid: true });
    expect(validateConnectionName('Production')).toEqual({ valid: true });
    expect(validateConnectionName('a')).toEqual({ valid: true });
  });

  it('rejects empty name', () => {
    const result = validateConnectionName('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Name is required');
  });

  it('rejects whitespace-only name', () => {
    expect(validateConnectionName('   ').valid).toBe(false);
    expect(validateConnectionName('\t').valid).toBe(false);
    expect(validateConnectionName('\n').valid).toBe(false);
  });
});

describe('validateHost', () => {
  it('accepts valid hosts', () => {
    expect(validateHost('localhost')).toEqual({ valid: true });
    expect(validateHost('127.0.0.1')).toEqual({ valid: true });
    expect(validateHost('redis.example.com')).toEqual({ valid: true });
    expect(validateHost('10.0.0.1')).toEqual({ valid: true });
  });

  it('rejects empty host', () => {
    const result = validateHost('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Host is required');
  });

  it('rejects whitespace-only host', () => {
    expect(validateHost('   ').valid).toBe(false);
    expect(validateHost('\t').valid).toBe(false);
  });
});

describe('validateConnectionConfig', () => {
  it('accepts valid configuration', () => {
    const result = validateConnectionConfig({
      name: 'Local Valkey',
      host: 'localhost',
      port: 6379,
      db: 0,
    });
    expect(result).toEqual({ valid: true });
  });

  it('accepts configuration without db', () => {
    const result = validateConnectionConfig({
      name: 'Production',
      host: 'redis.example.com',
      port: 6379,
    });
    expect(result).toEqual({ valid: true });
  });

  it('rejects invalid name', () => {
    const result = validateConnectionConfig({
      name: '',
      host: 'localhost',
      port: 6379,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Name is required');
  });

  it('rejects invalid host', () => {
    const result = validateConnectionConfig({
      name: 'Test',
      host: '',
      port: 6379,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Host is required');
  });

  it('rejects invalid port', () => {
    const result = validateConnectionConfig({
      name: 'Test',
      host: 'localhost',
      port: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Port');
  });

  it('rejects invalid db index', () => {
    const result = validateConnectionConfig({
      name: 'Test',
      host: 'localhost',
      port: 6379,
      db: 300,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Database index');
  });
});

describe('validateTTLInput', () => {
  it('accepts positive integers', () => {
    expect(validateTTLInput('1')).toEqual({ valid: true });
    expect(validateTTLInput('3600')).toEqual({ valid: true });
    expect(validateTTLInput('86400')).toEqual({ valid: true });
  });

  it('accepts -1 to remove expiry', () => {
    expect(validateTTLInput('-1')).toEqual({ valid: true });
  });

  it('rejects 0 with helpful message', () => {
    const result = validateTTLInput('0');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('0 would delete the key. Use -1 to remove expiry.');
  });

  it('rejects non-integer input', () => {
    expect(validateTTLInput('abc').valid).toBe(false);
    expect(validateTTLInput('').valid).toBe(false);
    expect(validateTTLInput('3.5').valid).toBe(false);
    expect(validateTTLInput(' ').valid).toBe(false);
  });

  it('rejects values less than -1', () => {
    expect(validateTTLInput('-2').valid).toBe(false);
    expect(validateTTLInput('-100').valid).toBe(false);
  });
});
