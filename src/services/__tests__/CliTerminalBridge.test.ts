import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscodeNs from 'vscode';
import type { CliTerminalProvider } from '../../providers/CliTerminalProvider';

vi.mock('vscode', () => ({}));

import { CliTerminalBridge } from '../CliTerminalBridge';

type FakeProvider = Pick<CliTerminalProvider, 'handleInput' | 'waitIdle'>;
type FakeTerminal = Pick<vscodeNs.Terminal, 'show'>;

const makeProvider = (): FakeProvider => ({
  handleInput: vi.fn(),
  waitIdle: vi.fn().mockResolvedValue(undefined),
});
const makeTerminal = (): FakeTerminal => ({ show: vi.fn() });

const fakeVscode = {
  commands: { executeCommand: vi.fn() },
};

const cast = <T>(v: unknown): T => v as T;

describe('CliTerminalBridge', () => {
  let bridge: CliTerminalBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new CliTerminalBridge(cast<typeof vscodeNs>(fakeVscode));
  });

  it('sendAndExecute appends \\r when provider is registered', async () => {
    const p = makeProvider();
    const t = makeTerminal();
    bridge.register('conn-1', cast<CliTerminalProvider>(p), cast<vscodeNs.Terminal>(t));
    await bridge.sendAndExecute('conn-1', 'FT.SEARCH idx:users *');
    expect(t.show).toHaveBeenCalledWith(false);
    expect(p.handleInput).toHaveBeenCalledWith('FT.SEARCH idx:users *\r');
    expect(p.waitIdle).toHaveBeenCalled();
  });

  it('sendForEdit does NOT append \\r', async () => {
    const p = makeProvider();
    const t = makeTerminal();
    bridge.register('conn-1', cast<CliTerminalProvider>(p), cast<vscodeNs.Terminal>(t));
    await bridge.sendForEdit('conn-1', 'FT.SEARCH idx:users *');
    expect(p.handleInput).toHaveBeenCalledWith('FT.SEARCH idx:users *');
    expect(p.handleInput).not.toHaveBeenCalledWith(expect.stringContaining('\r'));
  });

  it('opens CLI and awaits registration when no provider', async () => {
    const p = makeProvider();
    const t = makeTerminal();
    fakeVscode.commands.executeCommand.mockImplementation(async () => {
      bridge.register('conn-2', cast<CliTerminalProvider>(p), cast<vscodeNs.Terminal>(t));
    });
    await bridge.sendAndExecute('conn-2', 'PING');
    expect(fakeVscode.commands.executeCommand).toHaveBeenCalled();
    expect(p.handleInput).toHaveBeenCalledWith('PING\r');
  });

  it('unregister removes mapping only if same provider', () => {
    const p1 = makeProvider();
    const p2 = makeProvider();
    const t = makeTerminal();
    bridge.register('c', cast<CliTerminalProvider>(p1), cast<vscodeNs.Terminal>(t));
    bridge.register('c', cast<CliTerminalProvider>(p2), cast<vscodeNs.Terminal>(t));
    bridge.unregister('c', cast<CliTerminalProvider>(p1));
    const internals = bridge as unknown as { providers: Map<string, FakeProvider> };
    expect(internals.providers.get('c')).toBe(p2);
    bridge.unregister('c', cast<CliTerminalProvider>(p2));
    expect(internals.providers.get('c')).toBeUndefined();
  });

  it('rejects when OPEN_CLI command fails', async () => {
    fakeVscode.commands.executeCommand.mockRejectedValueOnce(new Error('connect failed'));
    await expect(bridge.sendAndExecute('conn-x', 'PING')).rejects.toThrow('connect failed');
    const internals = bridge as unknown as { pending: Map<string, unknown[]> };
    expect(internals.pending.get('conn-x')).toBeUndefined();
  });

  it('serializes back-to-back sends per connection', async () => {
    const p = makeProvider();
    const t = makeTerminal();
    let resolveIdle: () => void = () => undefined;
    const idleCalled = new Promise<void>((ready) => {
      (p.waitIdle as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => new Promise<void>((r) => {
          resolveIdle = r;
          ready();
        }),
      );
    });
    bridge.register('c', cast<CliTerminalProvider>(p), cast<vscodeNs.Terminal>(t));

    const first = bridge.sendAndExecute('c', 'A');
    const second = bridge.sendAndExecute('c', 'B');

    await idleCalled;
    expect(p.handleInput).not.toHaveBeenCalledWith('B\r');

    resolveIdle();
    await first;
    await second;

    const calls = (p.handleInput as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calls).toEqual(['A\r', 'B\r']);
  });
});
