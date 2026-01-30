import Valkey from 'iovalkey';
import { ServerStats } from '../models/stats.model';
import { parseRedisInfo } from '../utils/helpers';

export class StatsService {
  constructor(private client: Valkey) {}

  async getServerStats(): Promise<ServerStats> {
    const [info, dbsize] = await Promise.all([
      this.client.info(),
      this.client.dbsize(),
    ]);

    const parsed = parseRedisInfo(info);

    return {
      version: parsed['valkey_version'] || parsed['redis_version'] || 'unknown',
      role: (parsed['role'] || 'master') as 'master' | 'slave' | 'replica',
      uptimeSeconds: parseInt(parsed['uptime_in_seconds'] || '0', 10),
      connectedClients: parseInt(parsed['connected_clients'] || '0', 10),
      blockedClients: parseInt(parsed['blocked_clients'] || '0', 10),
      usedMemoryHuman: parsed['used_memory_human'] || '0B',
      usedMemoryPeakHuman: parsed['used_memory_peak_human'] || '0B',
      opsPerSec: parseInt(parsed['instantaneous_ops_per_sec'] || '0', 10),
      keyspaceHits: parseInt(parsed['keyspace_hits'] || '0', 10),
      keyspaceMisses: parseInt(parsed['keyspace_misses'] || '0', 10),
      totalKeys: dbsize,
      evictedKeys: parseInt(parsed['evicted_keys'] || '0', 10),
    };
  }
}
