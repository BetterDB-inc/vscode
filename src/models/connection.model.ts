export interface ConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: boolean;
  connectionTimeout?: number;
}

export interface ConnectionState {
  config: ConnectionConfig;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  error?: string;
  serverInfo?: ServerInfo;
}

export interface ServerInfo {
  version: string;
  mode: string;
  role: string;
  connectedClients: number;
  usedMemory: string;
}
