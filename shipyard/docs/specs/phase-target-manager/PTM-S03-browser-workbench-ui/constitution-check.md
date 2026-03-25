# Constitution Check

- [x] New modules respect SRP and dependency direction. WebSocket contracts in `contracts.ts`, server handlers in `server.ts`, React components in `ui/src/`. No cross-layer leakage.
- [x] Backwards compatibility respected. Existing WebSocket messages and workbench behavior are unchanged. Target manager fields are optional additions.
- [x] Testing strategy covers the change. Unit tests for Zod schemas and state serialization. Integration tests for server event emission. Manual smoke tests for React components.
- [x] New dependency justified and risk-assessed. No new dependencies. React components use existing patterns from the workbench.
