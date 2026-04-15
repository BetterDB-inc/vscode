import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as vscodeNs from 'vscode';
import type { CliTerminalProvider } from '../../providers/CliTerminalProvider';

vi.mock('vscode', () => ({}));

import { CliTerminalBridge } from '../CliTerminalBridge';

type FakeProvider = Pick<CliTerminalProvider, 'handleInput'>;
type FakeTerminal = Pick<vscodeNs.Terminal, 'show'>;
type FakeVscode = Pick<typeof vscodeNs, 'commands'>;

const makeProvider = (): FakeProvider => ({ handleInput: vi.fn() });
const makeTerminal = (): FakeTerminal => ({ show: vi.fn() });

const fakeVscode = {
  commands: { executeCommand: vi.fn() },
} as unknown as FakeVscode & { commands: { executeCommand: ReturnType<typeof vi.fn> } };

describe('CliTerminalBridge', () => {
  let bridge: CliTerminalBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new CliTerminalBridge(fakeVscode as typeof vscodeNs);
  });

  it('sendAndExecute appends \\r when provider is registered', async () => {
    const p = makeProvider();
    const t = makeTerminal();
    bridge.register('conn-1', p as CliTerminalProvider, t as vscodeNs.Terminal);
    await bridge.sendAndExecute('conn-1', 'FT.SEARCH idx:users *');
    expect(t.show).toHaveBeenCalledWith(false);
    expect(p.handleInput).toHaveBeenCalledWith('FT.SEARCH idx:users *\r');
  });

  it('sendForEdit does NOT append \\r', async () => {
    const p = makeProvider();
    const t = makeTerminal();
    bridge.register('conn-1', p as CliTerminalProvider, t as vscodeNs.Terminal);
    await bridge.sendForEdit('conn-1', 'FT.SEARCH idx:users *');
    expect(p.handleInput).toHaveBeenCalledWith('FT.SEARCH idx:users *');
    expect(p.handleInput).not.toHaveBeenCalledWith(expect.stringContaining('\r'));
  });

  it('opens CLI and awaits registration when no provider', async () => {
    const p = makeProvider();
    const t = makeTerminal();
    fakeVscode.commands.executeCommand.mockImplementation(async () => {
      bridge.register('conn-2', p as CliTerminalProvider, t as vscodeNs.Terminal);
    });
    await bridge.sendAndExecute('conn-2', 'PING');
    expect(fakeVscode.commands.executeCommand).toHaveBeenCalled();
    expect(p.handleInput).toHaveBeenCalledWith('PING\r');
  });

  it('unregister removes mapping only if same provider', () => {
    const p1 = makeProvider();
    const p2 = makeProvider();
    const t = makeTerminal();
    bridge.register('c', p1 as CliTerminalProvider, t as vscodeNs.Terminal);
    bridge.register('c', p2 as CliTerminalProvider, t as vscodeNs.Terminal);
    bridge.unregister('c', p1 as CliTerminalProvider);
    const internals = bridge as unknown as { providers: Map<string, FakeProvider> };
    expect(internals.providers.get('c')).toBe(p2);
    bridge.unregister('c', p2 as CliTerminalProvider);
    expect(internals.providers.get('c')).toBeUndefined();
  });
});
