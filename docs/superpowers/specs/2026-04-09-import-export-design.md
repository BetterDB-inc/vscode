# Import/Export Keys — Design Spec

## Overview

Add import and export functionality to BetterDB for Valkey, enabling backup/migration and developer workflows (sharing test data, seeding environments).

## Export Formats

### Plain Text Commands (`.txt`)

Human-readable Redis commands that recreate each key. Executable via `valkey-cli`.

```
# BetterDB Export | Production | user:* | 2026-04-09T12:00:00Z | 1247 keys
SET "user:1001" "hello world"
EXPIRE "user:1001" 7200
HSET "user:1002" "name" "Alice" "email" "alice@example.com"
EXPIRE "user:1002" 86400
SADD "user:1003:sessions" "sess_a" "sess_b" "sess_c"
LPUSH "user:1004:queue" "item1" "item2"
ZADD "user:1005:scores" 100 "alice" 85 "bob"
XADD "user:1006:stream" 1234567890-0 "field" "value"
JSON.SET "user:1007" $ '{"name":"Bob"}'
```

- One logical key = data command + optional `EXPIRE`
- Binary-safe values: escape newlines, quotes, non-printable bytes
- Streams use `XADD` with explicit IDs
- JSON keys use `JSON.SET`
- Header comment: connection name, pattern, date, key count

### Binary RDB (`.rdb`)

JSONL file with base64-encoded `DUMP` payloads per key.

```jsonl
{"_header":{"version":1,"source":"betterdb","date":"2026-04-09T12:00:00Z","pattern":"user:*","count":1247}}
{"key":"user:1001","ttl":7200,"dump":"AQAAAA...base64..."}
{"key":"user:1002","ttl":86400,"dump":"AgAAAA...base64..."}
```

- Each key exported via Redis `DUMP` command, base64-encoded for safe transport
- TTL stored as remaining seconds at export time
- Header line with version and metadata for validation on import

## Export Flow

### Trigger

Export button in the key browser toolbar. Exports all keys matching the current filter pattern (full scan, ignores the 100-key display limit).

### UI Steps

1. **Key browser** — user clicks Export button in toolbar
2. **Confirmation dialog** — shows:
   - Key count matching current filter (counted via a full `SCAN` pass before showing the dialog — same scan logic as `KeyService.scanAllKeys()` but without the display limit)
   - Format picker: Plain Text / Binary RDB
   - Optional "Limit export to:" checkbox with editable field (default 10,000, disabled by default)
3. **Save dialog** — native OS save dialog (`vscode.window.showSaveDialog`) with pre-filled filename and format-appropriate filter (`.txt` or `.rdb`)
4. **Progress** — cancellable `vscode.window.withProgress()` showing `n / total` keys
5. **Completion** — notification with key count and "Open File" action

### Streaming

Export writes to file incrementally via Node.js `fs.createWriteStream()`. Keys are scanned and serialized in batches — no full buffer in memory. Supports arbitrarily large exports.

## Import Flow

### Trigger

- Command palette: "BetterDB: Import Keys"
- Connection context menu: "Import Keys..."

### UI Steps

1. **File picker** — native OS open dialog (`vscode.window.showOpenDialog`) filtered to `.txt` and `.rdb` files
2. **Preview dialog** — shows:
   - File name, detected format (by extension; peek at header bytes if ambiguous)
   - Key count (from file header metadata)
   - Conflict strategy picker (no upfront conflict scan — applied per-key during execution):
     - **Skip** — keep existing keys, skip duplicates
     - **Overwrite** — replace existing keys with imported values
     - **Abort** — cancel entire import on first conflict
3. **Progress** — cancellable `vscode.window.withProgress()` showing `n / total` keys
4. **Result** — notification with summary: imported / skipped / failed counts, plus "Refresh Key Browser" action

### Streaming

Import reads line-by-line via Node.js `fs.createReadStream()` + `readline`. VS Code never loads file content. Memory usage stays flat regardless of file size.

### Parsing

**Plain text:** Line-by-line parser recognizing `SET`, `HSET`, `LPUSH`, `SADD`, `ZADD`, `XADD`, `JSON.SET`, `EXPIRE`. Groups related commands by key (data command + `EXPIRE`). Skips `#` comment lines and blank lines.

**Binary RDB:** Reads JSONL, validates header version, base64-decodes dump payload, calls `RESTORE key ttl payload` via client. Uses `REPLACE` flag when conflict strategy is Overwrite.

### Execution

- Commands executed via `iovalkey` client in pipelined batches (e.g., 100 keys at a time)
- Conflict handling per-key:
  - **Skip:** check `EXISTS` before writing, skip if true
  - **Overwrite:** for plain text, delete-then-set; for binary, `RESTORE` with `REPLACE` flag
  - **Abort:** check `EXISTS`, cancel on first hit
- Individual key failures don't abort import (unless Abort strategy)
- If 10+ consecutive failures, pause and prompt user to continue or cancel

### Error Handling

Errors collected during import and shown in result summary. Format: "1,224 imported, 23 skipped, 0 failed". Failed keys listed in an output channel for debugging.

## Architecture

### New Files

- `src/services/ExportService.ts` — serialization to both formats, streaming write
- `src/services/ImportService.ts` — parsing and execution for both formats, streaming read
- `src/commands/export.commands.ts` — registers export/import commands, orchestrates UI flow (dialogs, progress, file pickers)

### Integration Points

- `KeyService` — reused for `SCAN` key counting; `ExportService` and `ImportService` operate on the raw `iovalkey` client directly for performance (pipelined batch operations)
- `KeyTreeProvider` — export button added to tree view toolbar; tree refreshed after import
- `ConnectionTreeProvider` — "Import Keys..." added to connection node context menu
- `src/utils/constants.ts` — new command IDs (`betterdb.exportKeys`, `betterdb.importKeys`)
- `package.json` — new command registrations, menu contributions, toolbar button

### Commands

| Command ID | Trigger | Description |
|---|---|---|
| `betterdb.exportKeys` | Key browser toolbar button | Export keys matching current filter |
| `betterdb.importKeys` | Command palette, connection context menu | Import keys from file |

## Scope Exclusions

- No full RDB dump file import (server-side operation, out of scope for a client extension)
- No cloud storage integration (S3, GCS) — local file system only
- No scheduled/automated exports
- No diff/merge between exports
