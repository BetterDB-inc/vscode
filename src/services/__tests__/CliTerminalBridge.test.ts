import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({}));

import { CliTerminalBridge } from '../CliTerminalBridge';

const makeProvider = () => ({ handleInput: vi.fn() });
const makeTerminal = () => ({ show: vi.fn() });

const fakeVscode = {
  commands: { executeCommand: vi.fn() },
};

describe('CliTerminalBridge', () => {
  let bridge: CliTerminalBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new CliTerminalBridge(fakeVscode as any);
  });

  it('sendAndExecute appends \\r when provider is registered', async () => {
    const p = makeProvider();
    const t = makeTerminal();
    bridge.register('conn-1', p as any, t as any);
    await bridge.sendAndExecute('conn-1', 'FT.SEARCH idx:users *');
    expect(t.show).toHaveBeenCalledWith(false);
    expect(p.handleInput).toHaveBeenCalledWith('FT.SEARCH idx:users *\r');
  });

  it('sendForEdit does NOT append \\r', async () => {
    const p = makeProvider();
    const t = makeTerminal();
    bridge.register('conn-1', p as any, t as any);
    await bridge.sendForEdit('conn-1', 'FT.SEARCH idx:users *');
    expect(p.handleInput).toHaveBeenCalledWith('FT.SEARCH idx:users *');
    expect(p.handleInput).not.toHaveBeenCalledWith(expect.stringContaining('\r'));
  });

  it('opens CLI and awaits registration when no provider', async () => {
    const p = makeProvider();
    const t = makeTerminal();
    fakeVscode.commands.executeCommand.mockImplementation(async () => {
      bridge.register('conn-2', p as any, t as any);
    });
    await bridge.sendAndExecute('conn-2', 'PING');
    expect(fakeVscode.commands.executeCommand).toHaveBeenCalled();
    expect(p.handleInput).toHaveBeenCalledWith('PING\r');
  });

  it('unregister removes mapping only if same provider', () => {
    const p1 = makeProvider();
    const p2 = makeProvider();
    const t = makeTerminal();
    bridge.register('c', p1 as any, t as any);
    bridge.register('c', p2 as any, t as any);
    bridge.unregister('c', p1 as any);
    expect((bridge as any).providers.get('c')).toBe(p2);
    bridge.unregister('c', p2 as any);
    expect((bridge as any).providers.get('c')).toBeUndefined();
  });
});
