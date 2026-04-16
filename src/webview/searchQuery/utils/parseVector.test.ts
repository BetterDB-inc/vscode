import { describe, it, expect } from 'vitest';
import { parseVectorInput } from './parseVector';

describe('parseVectorInput', () => {
  it('parses valid JSON array', () => {
    const r = parseVectorInput('[1, 2, 3, 4]', 4);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.format).toBe('json');
      const view = new Float32Array(r.bytes);
      expect(Array.from(view)).toEqual([1, 2, 3, 4]);
    }
  });

  it('rejects JSON array with wrong dim', () => {
    const r = parseVectorInput('[1, 2, 3]', 4);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/expected 4 dims, got 3/);
  });

  it('rejects JSON array with non-numeric element', () => {
    const r = parseVectorInput('[1, 2, "three", 4]', 4);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/element 2/);
  });

  it('parses valid base64 with correct byte length', () => {
    const f32 = new Float32Array([1, 2]);
    const b64 = Buffer.from(f32.buffer).toString('base64');
    const r = parseVectorInput(b64, 2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.format).toBe('base64');
  });

  it('rejects base64 with wrong byte length', () => {
    const f32 = new Float32Array([1, 2]);
    const b64 = Buffer.from(f32.buffer).toString('base64');
    const r = parseVectorInput(b64, 4);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/expected 16 bytes, got 8/);
  });

  it('rejects empty input', () => {
    const r = parseVectorInput('', 4);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('empty input');
  });

  it('rejects whitespace-only input', () => {
    const r = parseVectorInput('   \n  ', 4);
    expect(r.ok).toBe(false);
  });

  it('rejects malformed JSON array (missing close bracket)', () => {
    const r = parseVectorInput('[1, 2, 3', 3);
    expect(r.ok).toBe(false);
  });
});
