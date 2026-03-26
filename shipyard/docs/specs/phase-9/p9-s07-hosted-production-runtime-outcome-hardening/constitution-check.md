# Constitution Check

- [x] New modules should respect SRP and dependency direction. Hosted
  capability detection, verification classification, recovery policy, and
  operator messaging remain separate concerns instead of one opaque
  catch-all verifier branch.
- [x] Backwards compatibility must be respected. Healthy local CLI and local UI
  verification flows keep their richer checks; the new behavior is primarily a
  hosted hardening pass for degraded environments.
- [x] Testing strategy covers the change. The story requires regression
  coverage for browser-unavailable hosting, long-lived preview readiness, and
  true code-failure counterexamples.
- [x] New dependency should be justified and risk-assessed. Prefer explicit
  capability detection and better verifier semantics before introducing new
  browser infrastructure or provider-specific orchestration.
