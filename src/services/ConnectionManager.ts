import * as vscode from 'vscode';
import Valkey from 'iovalkey';
import { ConnectionConfig, ConnectionState, ServerInfo } from '../models/connection.model';
import { STORAGE_KEYS } from '../utils/constants';
import { parseRedisInfo } from '../utils/helpers';
import { SshTunnelManager } from './SshTunnelManager';
import { probeSearchCapabilities } from './CapabilityProbe';
import { SearchCapabilities } from '../shared/types';

export class ConnectionManager {
  private connections: Map<string, Valkey> = new Map();
  private states: Map<string, ConnectionState> = new Map();
  private capsByConnection: Map<string, SearchCapabilities> = new Map();
  private _onDidChangeConnections = new vscode.EventEmitter<void>();
  readonly onDidChangeConnections = this._onDidChangeConnections.event;
  private sshTunnelManager = new SshTunnelManager();

  getCapabilities(configId: string): SearchCapabilities | undefined {
    return this.capsByConnection.get(configId);
  }

  private setSearchCapsContext(caps: SearchCapabilities | undefined): void {
    vscode.commands.executeCommand('setContext', 'betterdb.searchCaps.hasSearch', caps?.hasSearch ?? false);
    vscode.commands.executeCommand('setContext', 'betterdb.searchCaps.supportsVector', caps?.supportsVector ?? false);
    vscode.commands.executeCommand('setContext', 'betterdb.searchCaps.supportsText', caps?.supportsText ?? false);
  }

  constructor(private context: vscode.ExtensionContext) { }

  async loadConnections(): Promise<ConnectionConfig[]> {
    return this.context.globalState.get<ConnectionConfig[]>(STORAGE_KEYS.CONNECTIONS, []);
  }

  async saveConnection(config: ConnectionConfig): Promise<void> {
    const connections = await this.loadConnections();
    const existing = connections.findIndex((c) => c.id === config.id);

    const configToSave = { ...config, password: undefined };

    if (existing >= 0) {
      connections[existing] = configToSave;
    } else {
      connections.push(configToSave);
    }

    await this.context.globalState.update(STORAGE_KEYS.CONNECTIONS, connections);

    if (config.password) {
      await this.context.secrets.store(`password:${config.id}`, config.password);
    }

    this._onDidChangeConnections.fire();
  }

  async deleteConnection(configId: string): Promise<void> {
    await this.disconnect(configId);

    const connections = await this.loadConnections();
    const filtered = connections.filter((c) => c.id !== configId);
    await this.context.globalState.update(STORAGE_KEYS.CONNECTIONS, filtered);

    await this.context.secrets.delete(`password:${configId}`);
    await this.context.secrets.delete(`ssh-password:${configId}`);
    await this.context.secrets.delete(`ssh-passphrase:${configId}`);

    this.states.delete(configId);
    this._onDidChangeConnections.fire();
  }

  async connect(configId: string): Promise<void> {
    const configs = await this.loadConnections();
    const config = configs.find((c) => c.id === configId);
    if (!config) {
      throw new Error('Connection not found');
    }

    const password = await this.context.secrets.get(`password:${config.id}`);

    this.updateState(configId, { config, status: 'connecting' });

    try {
      let connectHost = config.host;
      let connectPort = config.port;

      if (config.ssh?.enabled) {
        const sshPassword = await this.context.secrets.get(`ssh-password:${config.id}`);
        const sshPassphrase = await this.context.secrets.get(`ssh-passphrase:${config.id}`);

        const localPort = await this.sshTunnelManager.createTunnel(configId, {
          sshHost: config.ssh.host,
          sshPort: config.ssh.port,
          sshUsername: config.ssh.username,
          authMethod: config.ssh.authMethod,
          password: sshPassword || undefined,
          privateKeyPath: config.ssh.privateKeyPath,
          passphrase: sshPassphrase || undefined,
          remoteHost: config.host,
          remotePort: config.port,
        });

        connectHost = '127.0.0.1';
        connectPort = localPort;
      }

      let tlsOptions: object | undefined;
      if (config.tls) {
        tlsOptions = config.ssh?.enabled ? { servername: config.host } : {};
      }

      const client = new Valkey({
        host: connectHost,
        port: connectPort,
        username: config.username || undefined,
        password: password || undefined,
        db: config.db || 0,
        tls: tlsOptions,
        connectTimeout: config.connectionTimeout || 10000,
        lazyConnect: true,
        retryStrategy: () => null,
      });

      client.on('error', (err) => {
        console.error('Valkey client error:', err);
      });

      client.on('close', () => {
        const state = this.states.get(configId);
        if (state && state.status === 'connected') {
          this.updateState(configId, { ...state, status: 'disconnected' });
        }
      });

      await client.connect();
      await client.client('SETNAME', 'BetterDB-for-Valkey');
      const info = await this.getServerInfo(client);

      this.connections.set(configId, client);
      this.updateState(configId, {
        config,
        status: 'connected',
        serverInfo: info,
      });

      try {
        const caps = await probeSearchCapabilities({
          call: (cmd: string, ...args: unknown[]) =>
            (client as unknown as { call: (c: string, ...a: unknown[]) => Promise<unknown> }).call(cmd, ...args),
        });
        this.capsByConnection.set(configId, caps);
        this.setSearchCapsContext(caps);
      } catch {
        this.capsByConnection.delete(configId);
        this.setSearchCapsContext(undefined);
      }
    } catch (err) {
      if (this.sshTunnelManager.hasTunnel(configId)) {
        await this.sshTunnelManager.closeTunnel(configId);
      }
      this.updateState(configId, {
        config,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw err;
    }
  }

  async disconnect(configId: string): Promise<void> {
    const client = this.connections.get(configId);
    if (client) {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
      this.connections.delete(configId);
    }

    if (this.sshTunnelManager.hasTunnel(configId)) {
      await this.sshTunnelManager.closeTunnel(configId);
    }

    this.capsByConnection.delete(configId);
    const remainingCaps = this.capsByConnection.values().next().value as SearchCapabilities | undefined;
    this.setSearchCapsContext(remainingCaps);

    const state = this.states.get(configId);
    if (state) {
      this.updateState(configId, { ...state, status: 'disconnected', error: undefined });
    }
  }

  getClient(configId: string): Valkey | undefined {
    return this.connections.get(configId);
  }

  getState(configId: string): ConnectionState | undefined {
    return this.states.get(configId);
  }

  isConnected(configId: string): boolean {
    return this.connections.has(configId);
  }

  private async getServerInfo(client: Valkey): Promise<ServerInfo> {
    const info = await client.info();
    const parsed = parseRedisInfo(info);

    return {
      version: parsed['redis_version'] || parsed['valkey_version'] || 'unknown',
      mode: parsed['redis_mode'] || 'standalone',
      role: parsed['role'] || 'master',
      connectedClients: parseInt(parsed['connected_clients'] || '0', 10),
      usedMemory: parsed['used_memory_human'] || '0B',
    };
  }

  private updateState(configId: string, state: ConnectionState): void {
    this.states.set(configId, state);
    this._onDidChangeConnections.fire();
  }

  dispose(): void {
    for (const [id] of this.connections) {
      this.disconnect(id).catch(() => { });
    }
    this.sshTunnelManager.closeAll().catch(() => { });
    this._onDidChangeConnections.dispose();
  }
}
