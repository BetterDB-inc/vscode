import { SearchCapabilities } from '../shared/types';
import { BETTERDB_PROBE_PREFIX } from '../utils/constants';

interface ProbeClient {
  call: (command: string, ...args: unknown[]) => Promise<unknown>;
}

interface ProbeOptions {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function tryCall(client: ProbeClient, command: string, ...args: unknown[]): Promise<unknown | null> {
  try {
    return await client.call(command, ...args);
  } catch {
    return null;
  }
}

async function cleanupStaleProbes(client: ProbeClient): Promise<void> {
  const list = await tryCall(client, 'FT._LIST');
  if (!Array.isArray(list)) return;
  for (const raw of list) {
    const name = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString() : String(raw);
    if (name.startsWith(BETTERDB_PROBE_PREFIX)) {
      await tryCall(client, 'FT.DROPINDEX', name);
    }
  }
}

async function probeCreate(client: ProbeClient, name: string, schema: string[]): Promise<boolean> {
  const result = await tryCall(
    client, 'FT.CREATE', name, 'ON', 'HASH', 'PREFIX', '1', `${name}:`, 'SCHEMA', ...schema
  );
  if (result === null) return false;
  await tryCall(client, 'FT.DROPINDEX', name);
  return true;
}

async function deriveEngineLabel(client: ProbeClient): Promise<string> {
  const modulesRaw = await tryCall(client, 'MODULE', 'LIST');
  let version = '';
  if (Array.isArray(modulesRaw)) {
    for (const entry of modulesRaw) {
      if (!Array.isArray(entry)) continue;
      const flat = entry as unknown[];
      const nameIdx = flat.indexOf('name');
      const verIdx = flat.indexOf('ver');
      if (nameIdx >= 0 && verIdx >= 0 && String(flat[nameIdx + 1]) === 'search') {
        const verNum = Number(flat[verIdx + 1]);
        if (Number.isFinite(verNum)) {
          const major = Math.floor(verNum / 10000);
          const minor = Math.floor((verNum % 10000) / 100);
          version = `${major}.${minor}`;
        }
      }
    }
  }
  const info = await tryCall(client, 'INFO', 'server');
  const infoStr = typeof info === 'string' ? info : Buffer.isBuffer(info) ? info.toString() : '';
  const isValkey = /server_name:\s*valkey/i.test(infoStr);
  if (!version) return '';
  return `${isValkey ? 'valkey-search' : 'RediSearch'} ${version}`;
}

export async function probeSearchCapabilities(
  client: ProbeClient,
  options: ProbeOptions = {}
): Promise<SearchCapabilities> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fallback: SearchCapabilities = {
    hasSearch: false,
    supportsVector: false,
    supportsText: false,
    engineLabel: '',
  };

  return withTimeout((async () => {
    const probe = await tryCall(client, 'FT._LIST');
    if (probe === null) return fallback;

    await cleanupStaleProbes(client);

    const supportsVector = await probeCreate(client, `${BETTERDB_PROBE_PREFIX}v__`, [
      'v', 'VECTOR', 'FLAT', '6', 'TYPE', 'FLOAT32', 'DIM', '2', 'DISTANCE_METRIC', 'COSINE',
    ]);
    const supportsText = await probeCreate(client, `${BETTERDB_PROBE_PREFIX}t__`, ['x', 'TEXT']);
    const engineLabel = await deriveEngineLabel(client);

    return { hasSearch: true, supportsVector, supportsText, engineLabel };
  })(), timeout, fallback);
}
