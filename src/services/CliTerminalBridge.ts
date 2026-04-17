import * as vscodeNs from 'vscode';
import { CliTerminalProvider } from '../providers/CliTerminalProvider';
import { COMMANDS } from '../utils/constants';

type VscodeApi = Pick<typeof vscodeNs, 'commands'>;

interface PendingResolver {
  resolve: (p: CliTerminalProvider) => void;
  reject: (e: Error) => void;
}

const REGISTRATION_TIMEOUT_MS = 5000;

export class CliTerminalBridge {
  private providers = new Map<string, CliTerminalProvider>();
  private terminals = new Map<string, vscodeNs.Terminal>();
  private pending = new Map<string, PendingResolver[]>();
  private inFlight = new Map<string, Promise<void>>();

  constructor(private vscode: VscodeApi = vscodeNs) {}

  register(connectionId: string, provider: CliTerminalProvider, terminal: vscodeNs.Terminal): void {
    this.providers.set(connectionId, provider);
    this.terminals.set(connectionId, terminal);
    const callbacks = this.pending.get(connectionId);
    if (callbacks) {
      callbacks.forEach((cb) => cb.resolve(provider));
      this.pending.delete(connectionId);
    }
  }

  unregister(connectionId: string, provider: CliTerminalProvider): void {
    if (this.providers.get(connectionId) === provider) {
      this.providers.delete(connectionId);
      this.terminals.delete(connectionId);
    }
  }

  sendAndExecute(connectionId: string, line: string): Promise<void> {
    return this.enqueue(connectionId, async () => {
      const provider = await this.ensureProvider(connectionId);
      this.terminals.get(connectionId)?.show(false);
      await this.waitIdle(provider);
      provider.handleInput(line + '\r');
    });
  }

  sendForEdit(connectionId: string, line: string): Promise<void> {
    return this.enqueue(connectionId, async () => {
      const provider = await this.ensureProvider(connectionId);
      this.terminals.get(connectionId)?.show(false);
      await this.waitIdle(provider);
      provider.handleInput(line);
    });
  }

  private enqueue(connectionId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.inFlight.get(connectionId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.inFlight.set(connectionId, next);
    next
      .finally(() => {
        if (this.inFlight.get(connectionId) === next) {
          this.inFlight.delete(connectionId);
        }
      })
      .catch(() => undefined);
    return next;
  }

  private async waitIdle(provider: CliTerminalProvider): Promise<void> {
    if (typeof provider.waitIdle === 'function') {
      await provider.waitIdle();
    }
  }

  private async ensureProvider(connectionId: string): Promise<CliTerminalProvider> {
    const existing = this.providers.get(connectionId);
    if (existing) return existing;

    let pendingResolver: PendingResolver | undefined;
    const registered = new Promise<CliTerminalProvider>((resolve, reject) => {
      pendingResolver = { resolve, reject };
      const list = this.pending.get(connectionId) ?? [];
      list.push(pendingResolver);
      this.pending.set(connectionId, list);
    });
    registered.catch(() => undefined);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`CLI registration timed out for ${connectionId}`)),
        REGISTRATION_TIMEOUT_MS,
      );
    });
    timeout.catch(() => undefined);

    try {
      await this.vscode.commands.executeCommand(COMMANDS.OPEN_CLI, connectionId);
      return await Promise.race([registered, timeout]);
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (pendingResolver) this.removePending(connectionId, pendingResolver);
    }
  }

  private removePending(connectionId: string, target: PendingResolver): void {
    const list = this.pending.get(connectionId);
    if (!list) return;
    const filtered = list.filter((r) => r !== target);
    if (filtered.length === 0) {
      this.pending.delete(connectionId);
    } else {
      this.pending.set(connectionId, filtered);
    }
  }
}
