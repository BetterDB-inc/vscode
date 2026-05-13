import { describe, it, expect } from 'vitest';
import { probeSearchCapabilities } from '../CapabilityProbe';

type CallFn = (cmd: string, ...args: unknown[]) => Promise<unknown>;

function mkClient(handlers: Record<string, (args: unknown[]) => unknown | Promise<unknown>>) {
  const call: CallFn = async (cmd, ...args) => {
    const key = `${cmd} ${String(args[0] ?? '')}`.trim();
    const h = handlers[key] ?? handlers[cmd];
    if (!h) throw new Error(`unexpected command: ${cmd} ${args.join(' ')}`);
    return h(args);
  };
  return { call };
}

describe('probeSearchCapabilities', () => {
  it('returns no-search when FT._LIST is unknown', async () => {
    const client = mkClient({
      'FT._LIST': () => { throw new Error('ERR unknown command'); }
    });
    const caps = await probeSearchCapabilities(client as never);
    expect(caps).toEqual({
      hasSearch: false,
      supportsVector: false,
      supportsText: false,
      engineLabel: '',
    });
  });

  it('reports full caps when both probes succeed', async () => {
    const created: string[] = [];
    const client = mkClient({
      'FT._LIST': () => [],
      'FT.CREATE': (args) => { created.push(String(args[0])); return 'OK'; },
      'FT.DROPINDEX': () => 'OK',
      'MODULE': () => [['name', 'search', 'ver', 20810]],
      'INFO': () => 'server_name:redis\r\nredis_version:7.4.0\r\n',
    });
    const caps = await probeSearchCapabilities(client as never);
    expect(caps.hasSearch).toBe(true);
    expect(caps.supportsVector).toBe(true);
    expect(caps.supportsText).toBe(true);
    expect(caps.engineLabel).toMatch(/RediSearch 2\.8/);
    expect(created).toContain('__betterdb_probe_v__');
    expect(created).toContain('__betterdb_probe_t__');
  });

  it('reports valkey-search profile when text probe fails', async () => {
    const client = mkClient({
      'FT._LIST': () => [],
      'FT.CREATE': (args) => {
        const name = String(args[0]);
        if (name === '__betterdb_probe_t__') throw new Error('Unknown argument TEXT');
        return 'OK';
      },
      'FT.DROPINDEX': () => 'OK',
      'MODULE': () => [['name', 'search', 'ver', 10000]],
      'INFO': () => 'server_name:valkey\r\n',
    });
    const caps = await probeSearchCapabilities(client as never);
    expect(caps.supportsVector).toBe(true);
    expect(caps.supportsText).toBe(false);
    expect(caps.engineLabel).toMatch(/valkey-search 1\.0/);
  });

  it('cleans up stale probe indexes before probing', async () => {
    const dropped: string[] = [];
    const client = mkClient({
      'FT._LIST': () => ['__betterdb_probe_v__', 'user_idx'],
      'FT.DROPINDEX': (args) => { dropped.push(String(args[0])); return 'OK'; },
      'FT.CREATE': () => 'OK',
      'MODULE': () => [],
      'INFO': () => '',
    });
    await probeSearchCapabilities(client as never);
    expect(dropped).toContain('__betterdb_probe_v__');
    expect(dropped).not.toContain('user_idx');
  });

  it('returns conservative caps when probe hits timeout', async () => {
    const client = {
      call: () => new Promise(() => {}),
    };
    const caps = await probeSearchCapabilities(client as never, { timeoutMs: 50 });
    expect(caps.hasSearch).toBe(false);
    expect(caps.supportsVector).toBe(false);
  });
});
