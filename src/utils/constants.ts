export const EXTENSION_ID = 'betterdb-vscode';
export const EXTENSION_NAME = 'BetterDB for Valkey';

export const STORAGE_KEYS = {
  CONNECTIONS: 'connections',
  ACTIVE_CONNECTION: 'activeConnection',
  CLI_HISTORY: 'cliHistory',
} as const;

export const DEFAULT_CONNECTION = {
  host: 'localhost',
  port: 6379,
  db: 0,
  connectionTimeout: 10000,
} as const;

export const SCAN_COUNT = 500;
export const DISPLAY_LIMIT = 100;

export const CLI = {
  MAX_HISTORY_SIZE: 250,
  HISTORY_DISPLAY_LIMIT: 20,
  PROGRESS_INTERVAL_MS: 500,
  MAX_PROGRESS_PERCENTAGE: 95,
} as const;

export const TYPE_ICONS: Record<string, string> = {
  string: 'symbol-string',
  hash: 'symbol-object',
  list: 'symbol-array',
  set: 'symbol-enum',
  zset: 'symbol-numeric',
  stream: 'pulse',
  json: 'json',
  unknown: 'question',
};

export const COMMANDS = {
  ADD_CONNECTION: 'betterdb.addConnection',
  CONNECT: 'betterdb.connect',
  DISCONNECT: 'betterdb.disconnect',
  DELETE_CONNECTION: 'betterdb.deleteConnection',
  EDIT_CONNECTION: 'betterdb.editConnection',
  BROWSE_KEYS: 'betterdb.browseKeys',
  FILTER_KEYS: 'betterdb.filterKeys',
  REFRESH_KEYS: 'betterdb.refreshKeys',
  OPEN_KEY: 'betterdb.openKey',
  DELETE_KEY: 'betterdb.deleteKey',
  OPEN_CLI: 'betterdb.openCli',
  ADD_KEY: 'betterdb.addKey',
  REFRESH_STATS: 'betterdb.refreshStats',
  REFRESH_SEARCH: 'betterdb.refreshSearch',
  EDIT_TTL: 'betterdb.editTtl',
  RENAME_KEY: 'betterdb.renameKey',
  EDIT_KEY: 'betterdb.editKey',
  EXPORT_KEYS: 'betterdb.exportKeys',
  IMPORT_KEYS: 'betterdb.importKeys',
  OPEN_SEARCH_QUERY: 'betterdb.openSearchQuery',
} as const;
