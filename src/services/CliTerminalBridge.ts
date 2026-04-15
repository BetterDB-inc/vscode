import * as vscodeNs from 'vscode';
import { CliTerminalProvider } from '../providers/CliTerminalProvider';
import { COMMANDS } from '../utils/constants';

type VscodeApi = Pick<typeof vscodeNs, 'commands'>;

export class CliTerminalBridge {
  private providers = new Map<string, CliTerminalProvider>();
  private terminals = new Map<string, vscodeNs.Terminal>();
  private pending = new Map<string, ((p: CliTerminalProvider) => void)[]>();

  constructor(private vscode: VscodeApi = vscodeNs) {}

  register(connectionId: string, provider: CliTerminalProvider, terminal: vscodeNs.Terminal): void {
    this.providers.set(connectionId, provider);
    this.terminals.set(connectionId, terminal);
    const callbacks = this.pending.get(connectionId);
    if (callbacks) {
      callbacks.forEach((cb) => cb(provider));
      this.pending.delete(connectionId);
    }
  }

  unregister(connectionId: string, provider: CliTerminalProvider): void {
    if (this.providers.get(connectionId) === provider) {
      this.providers.delete(connectionId);
      this.terminals.delete(connectionId);
    }
  }

  async sendAndExecute(connectionId: string, line: string): Promise<void> {
    const provider = await this.ensureProvider(connectionId);
    this.terminals.get(connectionId)?.show(false);
    provider.handleInput(line + '\r');
  }

  async sendForEdit(connectionId: string, line: string): Promise<void> {
    const provider = await this.ensureProvider(connectionId);
    this.terminals.get(connectionId)?.show(false);
    provider.handleInput(line);
  }

  private async ensureProvider(connectionId: string): Promise<CliTerminalProvider> {
    const existing = this.providers.get(connectionId);
    if (existing) return existing;

    const registered = new Promise<CliTerminalProvider>((resolve) => {
      const list = this.pending.get(connectionId) ?? [];
      list.push(resolve);
      this.pending.set(connectionId, list);
    });

    await this.vscode.commands.executeCommand(COMMANDS.OPEN_CLI, connectionId);
    return registered;
  }
}
