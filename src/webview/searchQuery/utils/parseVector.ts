export type ParseResult =
  | { ok: true; bytes: ArrayBuffer; format: 'base64' | 'json' }
  | { ok: false; error: string };

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export function parseVectorInput(raw: string, expectedDim: number): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'empty input' };

  if (trimmed.startsWith('[')) {
    if (!trimmed.endsWith(']')) return { ok: false, error: 'malformed JSON array' };
    let arr: unknown;
    try {
      arr = JSON.parse(trimmed);
    } catch (e) {
      return { ok: false, error: `JSON parse: ${(e as Error).message}` };
    }
    if (!Array.isArray(arr)) return { ok: false, error: 'not an array' };
    if (arr.length !== expectedDim) {
      return { ok: false, error: `expected ${expectedDim} dims, got ${arr.length}` };
    }
    const f32 = new Float32Array(expectedDim);
    for (let i = 0; i < expectedDim; i++) {
      const v = arr[i];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        return { ok: false, error: `element ${i} is not a finite number` };
      }
      f32[i] = v;
    }
    return { ok: true, bytes: f32.buffer, format: 'json' };
  }

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(trimmed);
  } catch {
    return { ok: false, error: 'invalid base64' };
  }
  const expectedBytes = expectedDim * 4;
  if (bytes.byteLength !== expectedBytes) {
    return { ok: false, error: `expected ${expectedBytes} bytes, got ${bytes.byteLength}` };
  }
  const sliced = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return {
    ok: true,
    bytes: sliced,
    format: 'base64',
  };
}
