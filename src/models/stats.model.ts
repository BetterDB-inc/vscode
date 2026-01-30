export interface ServerStats {
  version: string;
  role: 'master' | 'slave' | 'replica';
  uptimeSeconds: number;
  connectedClients: number;
  blockedClients: number;
  usedMemoryHuman: string;
  usedMemoryPeakHuman: string;
  opsPerSec: number;
  keyspaceHits: number;
  keyspaceMisses: number;
  totalKeys: number;
  evictedKeys: number;
}
