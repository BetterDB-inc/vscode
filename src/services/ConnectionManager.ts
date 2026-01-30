import * as vscode from 'vscode';
import Valkey from 'iovalkey';
import { ConnectionConfig, ConnectionState, ServerInfo } from '../models/connection.model';
import { STORAGE_KEYS } from '../utils/constants';
import { parseRedisInfo } from '../utils/helpers';

export class ConnectionManager {
  private connections: Map<string, Valkey> = new Map();
  private states: Map<string, ConnectionState> = new Map();
  private _onDidChangeConnections = new vscode.EventEmitter<void>();
  readonly onDidChangeConnections = this._onDidChangeConnections.event;

  constructor(private context: vscode.ExtensionContext) {}

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

    const client = new Valkey({
      host: config.host,
      port: config.port,
      username: config.username || undefined,
      password: password || undefined,
      db: config.db || 0,
      tls: config.tls ? {} : undefined,
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

    try {
      await client.connect();
      await client.client('SETNAME', 'BetterDB-for-Valkey');
      const info = await this.getServerInfo(client);

      this.connections.set(configId, client);
      this.updateState(configId, {
        config,
        status: 'connected',
        serverInfo: info,
      });
    } catch (err) {
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
      this.disconnect(id).catch(() => {});
    }
    this._onDidChangeConnections.dispose();
  }
}
