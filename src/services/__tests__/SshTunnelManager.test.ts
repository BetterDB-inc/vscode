import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SshTunnelManager } from '../SshTunnelManager';

vi.mock('ssh2', async () => {
  const { EventEmitter } = await import('events');

  class MockClient extends EventEmitter {
    connect = vi.fn(function (this: MockClient) {
      setTimeout(() => this.emit('ready'), 0);
    });
    forwardOut = vi.fn(
      (
        _srcIP: string,
        _srcPort: number,
        _dstIP: string,
        _dstPort: number,
        cb: (err: Error | undefined, stream: InstanceType<typeof EventEmitter>) => void
      ) => {
        const stream = new EventEmitter();
        (stream as EventEmitter & { pipe: ReturnType<typeof vi.fn> }).pipe = vi.fn().mockReturnValue(stream);
        cb(undefined, stream);
      }
    );
    end = vi.fn();
  }
  return { Client: MockClient };
});

vi.mock('net', async () => {
  const { EventEmitter } = await import('events');

  class MockServer extends EventEmitter {
    private port = 0;
    listen = vi.fn(function (this: MockServer, _port: number, _host: string, cb: () => void) {
      this.port = 54321;
      cb();
    });
    address = vi.fn(function (this: MockServer) {
      return { port: this.port, address: '127.0.0.1', family: 'IPv4' };
    });
    close = vi.fn((_cb?: () => void) => {
      if (_cb) _cb();
    });
  }

  return {
    createServer: vi.fn(() => new MockServer()),
  };
});

vi.mock('fs', () => ({
  existsSync: vi.fn((path: string) => !path.includes('nonexistent')),
  readFileSync: vi.fn((path: string) => {
    if (path.includes('unreadable')) {
      throw new Error('Permission denied');
    }
    return Buffer.from('fake-private-key');
  }),
}));

describe('SshTunnelManager', () => {
  let manager: SshTunnelManager;

  beforeEach(() => {
    manager = new SshTunnelManager();
  });

  afterEach(async () => {
    await manager.closeAll();
    vi.clearAllMocks();
  });

  describe('createTunnel', () => {
    it('creates a tunnel with password auth and returns a local port', async () => {
      const port = await manager.createTunnel('conn-1', {
        sshHost: 'ssh.example.com',
        sshPort: 22,
        sshUsername: 'user',
        authMethod: 'password',
        password: 'secret',
        remoteHost: '127.0.0.1',
        remotePort: 6379,
      });

      expect(port).toBe(54321);
      expect(manager.hasTunnel('conn-1')).toBe(true);
    });

    it('creates a tunnel with private key auth', async () => {
      const port = await manager.createTunnel('conn-2', {
        sshHost: 'ssh.example.com',
        sshPort: 22,
        sshUsername: 'user',
        authMethod: 'privateKey',
        privateKeyPath: '/home/user/.ssh/id_rsa',
        remoteHost: '127.0.0.1',
        remotePort: 6379,
      });

      expect(port).toBe(54321);
      expect(manager.hasTunnel('conn-2')).toBe(true);
    });

    it('throws when private key file does not exist', async () => {
      await expect(
        manager.createTunnel('conn-3', {
          sshHost: 'ssh.example.com',
          sshPort: 22,
          sshUsername: 'user',
          authMethod: 'privateKey',
          privateKeyPath: '/nonexistent/key',
          remoteHost: '127.0.0.1',
          remotePort: 6379,
        })
      ).rejects.toThrow('SSH private key file not found');
    });

    it('throws when private key file is unreadable', async () => {
      await expect(
        manager.createTunnel('conn-4', {
          sshHost: 'ssh.example.com',
          sshPort: 22,
          sshUsername: 'user',
          authMethod: 'privateKey',
          privateKeyPath: '/home/user/.ssh/unreadable_key',
          remoteHost: '127.0.0.1',
          remotePort: 6379,
        })
      ).rejects.toThrow('Could not read SSH private key');
    });

    it('replaces an existing tunnel for the same connection', async () => {
      await manager.createTunnel('conn-5', {
        sshHost: 'ssh.example.com',
        sshPort: 22,
        sshUsername: 'user',
        authMethod: 'password',
        password: 'secret',
        remoteHost: '127.0.0.1',
        remotePort: 6379,
      });

      const port = await manager.createTunnel('conn-5', {
        sshHost: 'ssh2.example.com',
        sshPort: 22,
        sshUsername: 'user',
        authMethod: 'password',
        password: 'secret',
        remoteHost: '127.0.0.1',
        remotePort: 6380,
      });

      expect(port).toBe(54321);
      expect(manager.hasTunnel('conn-5')).toBe(true);
    });

    it('supports multiple simultaneous tunnels', async () => {
      await manager.createTunnel('conn-a', {
        sshHost: 'ssh1.example.com',
        sshPort: 22,
        sshUsername: 'user',
        authMethod: 'password',
        password: 'secret',
        remoteHost: '127.0.0.1',
        remotePort: 6379,
      });

      await manager.createTunnel('conn-b', {
        sshHost: 'ssh2.example.com',
        sshPort: 22,
        sshUsername: 'user',
        authMethod: 'password',
        password: 'secret',
        remoteHost: '127.0.0.1',
        remotePort: 6380,
      });

      expect(manager.hasTunnel('conn-a')).toBe(true);
      expect(manager.hasTunnel('conn-b')).toBe(true);
    });
  });

  describe('closeTunnel', () => {
    it('closes an existing tunnel', async () => {
      await manager.createTunnel('conn-close', {
        sshHost: 'ssh.example.com',
        sshPort: 22,
        sshUsername: 'user',
        authMethod: 'password',
        password: 'secret',
        remoteHost: '127.0.0.1',
        remotePort: 6379,
      });

      expect(manager.hasTunnel('conn-close')).toBe(true);
      await manager.closeTunnel('conn-close');
      expect(manager.hasTunnel('conn-close')).toBe(false);
    });

    it('does nothing when closing a nonexistent tunnel', async () => {
      await expect(manager.closeTunnel('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('closeAll', () => {
    it('closes all tunnels', async () => {
      await manager.createTunnel('conn-x', {
        sshHost: 'ssh.example.com',
        sshPort: 22,
        sshUsername: 'user',
        authMethod: 'password',
        password: 'secret',
        remoteHost: '127.0.0.1',
        remotePort: 6379,
      });

      await manager.createTunnel('conn-y', {
        sshHost: 'ssh.example.com',
        sshPort: 22,
        sshUsername: 'user',
        authMethod: 'password',
        password: 'secret',
        remoteHost: '127.0.0.1',
        remotePort: 6380,
      });

      await manager.closeAll();
      expect(manager.hasTunnel('conn-x')).toBe(false);
      expect(manager.hasTunnel('conn-y')).toBe(false);
    });

    it('succeeds when no tunnels exist', async () => {
      await expect(manager.closeAll()).resolves.toBeUndefined();
    });
  });

  describe('hasTunnel', () => {
    it('returns false for unknown connection', () => {
      expect(manager.hasTunnel('unknown')).toBe(false);
    });

    it('returns true after creating a tunnel', async () => {
      await manager.createTunnel('conn-has', {
        sshHost: 'ssh.example.com',
        sshPort: 22,
        sshUsername: 'user',
        authMethod: 'password',
        password: 'secret',
        remoteHost: '127.0.0.1',
        remotePort: 6379,
      });
      expect(manager.hasTunnel('conn-has')).toBe(true);
    });
  });
});
