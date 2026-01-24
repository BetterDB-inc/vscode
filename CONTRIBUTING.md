# Contributing to BetterDB for Valkey

Thanks for your interest in contributing! This document outlines how to get started.

## Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/betterdb-inc/vscode.git
   cd betterdb-for-valkey
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the extension**

   ```bash
   npm run build
   ```

4. **Run in development mode**

   - Open the project in VS Code
   - Press `F5` to launch the Extension Development Host
   - Changes to the extension require reloading the window
   - Changes to the webview require rebuilding (`npm run build:webview`)

## Project Structure

```
src/
├── commands/       # Command handlers
├── models/         # TypeScript interfaces
├── providers/      # Tree providers, terminal, webview
├── services/       # Connection manager, key operations
├── shared/         # Shared types and utilities (extension + webview)
├── utils/          # Constants, helpers, error handling
├── webview/        # React components for key editor
└── extension.ts    # Entry point
```

## Shared Code

The `src/shared/` folder contains code used by both the extension and webview:

- `types.ts` - Common type definitions (`KeyType`, `KeyData`, `KeyValueData`)
- `formatters.ts` - Shared formatting functions (`formatTTL`)

When adding code that needs to work in both contexts, place it here. Import from `shared/` rather than duplicating code.

## Code Style

- TypeScript with strict mode enabled
- ESLint for linting (`npm run lint`)
- No comments in production code—code should be self-documenting
- Prefer constants over magic numbers
- Place shared types and utilities in `src/shared/`

## Running Tests

```bash
npm test
```

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run linting and tests
5. Commit with a clear message
6. Push to your fork
7. Open a Pull Request

## Pull Request Guidelines

- Keep PRs focused on a single change
- Add tests for new functionality
- Ensure CI passes before requesting review

## Good First Issues

Looking for something to work on? Check issues labeled [`good first issue`](https://github.com/betterdb-inc/vscode/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

## Questions?

Open an issue or start a discussion. We're happy to help!
