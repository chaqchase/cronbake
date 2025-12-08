# Cronbake Examples

These TypeScript scripts demonstrate common Cronbake setups. They live outside the published bundle (`package.json` only ships the `dist/` folder), so they are safe to keep in the repo.

## Prerequisites

From the project root:

```bash
bun install
```

## Run the stateless example

```bash
bun run examples/basic.ts
```

This spawns two in-memory jobs and listens for Ctrl+C to stop them.

## Run the persistence example

```bash
bun run examples/persistence.ts
```

The script writes state to `./.cronbake-state.json`, demonstrating `persist: true` vs. `persist: false` jobs and `await baker.ready()`.

## Run the logging example

```bash
bun run examples/logging.ts
```

This demonstrates custom logger support:

- Creating a custom logger with colored output
- Using a global logger for all jobs via Baker
- Overriding the logger per job
- Error logging when jobs fail

Feel free to copy these files or adapt them into your own app bootstrap logic.
