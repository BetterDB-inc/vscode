import { Client } from 'ssh2';
import * as net from 'net';
import * as fs from 'fs';
import * as vscode from 'vscode';

const log = vscode.window.createOutputChannel('BetterDB SSH Tunnel');

interface TunnelConfig {
  sshHost: string;
  sshPort: number;
  sshUsername: string;
  authMethod: 'password' | 'privateKey';
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  remoteHost: string;
  remotePort: number;
}

interface TunnelInfo {
  client: Client;
  server: net.Server;
  localPort: number;
}

export class SshTunnelManager {
  private tunnels: Map<string, TunnelInfo> = new Map();

  async createTunnel(connectionId: string, config: TunnelConfig): Promise<number> {
    log.appendLine(`[${connectionId}] Creating tunnel: SSH ${config.sshUsername}@${config.sshHost}:${config.sshPort} → ${config.remoteHost}:${config.remotePort}`);
    log.appendLine(`[${connectionId}] Auth method: ${config.authMethod}${config.privateKeyPath ? ` (key: ${config.privateKeyPath})` : ''}`);
    log.show(true);

    if (this.tunnels.has(connectionId)) {
      log.appendLine(`[${connectionId}] Closing existing tunnel`);
      await this.closeTunnel(connectionId);
    }

    let privateKey: Buffer | undefined;
    if (config.authMethod === 'privateKey' && config.privateKeyPath) {
      if (!fs.existsSync(config.privateKeyPath)) {
        throw new Error(`SSH private key file not found: ${config.privateKeyPath}`);
      }
      try {
        privateKey = fs.readFileSync(config.privateKeyPath);
        log.appendLine(`[${connectionId}] Private key loaded (${privateKey.length} bytes)`);
      } catch {
        throw new Error(
          `Could not read SSH private key — the file may be in an unsupported format or the passphrase is incorrect`
        );
      }
    }

    const sshClient = new Client();

    log.appendLine(`[${connectionId}] Connecting to SSH server...`);
    await new Promise<void>((resolve, reject) => {
      sshClient.on('ready', () => {
        log.appendLine(`[${connectionId}] SSH connection established`);
        resolve();
      });
      sshClient.on('error', (err: Error & { level?: string }) => {
        log.appendLine(`[${connectionId}] SSH error: ${err.message} (level: ${err.level})`);
        if (err.level === 'client-authentication') {
          reject(
            new Error(
              `SSH authentication failed for ${config.sshUsername}@${config.sshHost}:${config.sshPort} — check your credentials`
            )
          );
        } else if (err.message?.includes('ECONNREFUSED')) {
          reject(new Error(`Cannot reach SSH server at ${config.sshHost}:${config.sshPort}`));
        } else if (err.message?.includes('ETIMEDOUT') || err.message?.includes('EHOSTUNREACH')) {
          reject(
            new Error(
              `SSH server at ${config.sshHost}:${config.sshPort} is unreachable — check the hostname and your network`
            )
          );
        } else {
          reject(new Error(`SSH connection error: ${err.message}`));
        }
      });

      sshClient.connect({
        host: config.sshHost,
        port: config.sshPort,
        username: config.sshUsername,
        password: config.authMethod === 'password' ? config.password : undefined,
        privateKey: config.authMethod === 'privateKey' ? privateKey : undefined,
        passphrase: config.authMethod === 'privateKey' ? config.passphrase : undefined,
      });
    });

    try {
      log.appendLine(`[${connectionId}] Testing forwardOut to ${config.remoteHost}:${config.remotePort}...`);
      await new Promise<void>((resolve, reject) => {
        sshClient.forwardOut('127.0.0.1', 0, config.remoteHost, config.remotePort, (err, stream) => {
          if (err) {
            log.appendLine(`[${connectionId}] forwardOut test FAILED: ${err.message}`);
            reject(
              new Error(
                `Connected to SSH server, but Valkey at ${config.remoteHost}:${config.remotePort} refused the connection`
              )
            );
          } else {
            log.appendLine(`[${connectionId}] forwardOut test OK — remote port is reachable`);
            stream.end();
            resolve();
          }
        });
      });

      const server = net.createServer((socket) => {
        log.appendLine(`[${connectionId}] Incoming connection on local tunnel, calling forwardOut...`);
        sshClient.forwardOut(
          '127.0.0.1',
          0,
          config.remoteHost,
          config.remotePort,
          (err, stream) => {
            if (err) {
              log.appendLine(`[${connectionId}] forwardOut FAILED: ${err.message}`);
              socket.destroy(
                new Error(
                  `SSH tunnel forwarding failed to ${config.remoteHost}:${config.remotePort}: ${err.message}`
                )
              );
              return;
            }
            log.appendLine(`[${connectionId}] forwardOut OK, piping data`);
            socket.pipe(stream);
            stream.pipe(socket);
            socket.on('error', (e) => {
              log.appendLine(`[${connectionId}] Socket error: ${e.message}`);
              stream.destroy();
            });
            stream.on('error', (e) => {
              log.appendLine(`[${connectionId}] Stream error: ${e.message}`);
              socket.destroy();
            });
            stream.on('close', () => {
              log.appendLine(`[${connectionId}] Stream closed`);
              socket.destroy();
            });
            socket.on('close', () => {
              log.appendLine(`[${connectionId}] Socket closed`);
            });
          }
        );
      });

      const localPort = await new Promise<number>((resolve, reject) => {
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (addr && typeof addr === 'object') {
            resolve(addr.port);
          } else {
            reject(new Error('Failed to bind local tunnel port'));
          }
        });
      });

      log.appendLine(`[${connectionId}] Local tunnel listening on 127.0.0.1:${localPort}`);

      sshClient.on('error', (err) => {
        log.appendLine(`[${connectionId}] SSH client error (post-connect): ${err.message}`);
        this.closeTunnel(connectionId).catch(() => {});
      });

      sshClient.on('close', () => {
        log.appendLine(`[${connectionId}] SSH client connection closed`);
        const tunnel = this.tunnels.get(connectionId);
        if (tunnel) {
          tunnel.server.close();
          this.tunnels.delete(connectionId);
        }
      });

      this.tunnels.set(connectionId, { client: sshClient, server, localPort });
      log.appendLine(`[${connectionId}] Tunnel ready — Valkey client should connect to 127.0.0.1:${localPort}`);
      return localPort;
    } catch (err) {
      log.appendLine(`[${connectionId}] Tunnel creation failed, cleaning up SSH client`);
      sshClient.end();
      throw err;
    }
  }

  async closeTunnel(connectionId: string): Promise<void> {
    const tunnel = this.tunnels.get(connectionId);
    if (!tunnel) {
      return;
    }

    this.tunnels.delete(connectionId);

    await new Promise<void>((resolve) => {
      tunnel.server.close(() => resolve());
    });

    tunnel.client.end();
  }

  async closeAll(): Promise<void> {
    const ids = [...this.tunnels.keys()];
    await Promise.all(ids.map((id) => this.closeTunnel(id)));
  }

  hasTunnel(connectionId: string): boolean {
    return this.tunnels.has(connectionId);
  }
}
