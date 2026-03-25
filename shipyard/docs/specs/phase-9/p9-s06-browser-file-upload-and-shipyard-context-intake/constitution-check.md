# Constitution Check

- [x] New modules respect SRP and dependency direction. Upload intake,
  workspace storage, session persistence, and composer presentation remain
  separate instead of bolting raw file bytes into prompt orchestration.
- [x] Backwards compatibility respected. Existing text-only context injection,
  normal browser chat, and local CLI flows keep working when no files are
  attached.
- [x] Testing strategy covers the change. Upload validation, persistence,
  next-turn context synthesis, and composer states all have explicit coverage.
- [x] New dependency justified and risk-assessed. Prefer browser-native
  multipart upload and existing Node primitives before introducing a heavier
  server framework or upload middleware.
