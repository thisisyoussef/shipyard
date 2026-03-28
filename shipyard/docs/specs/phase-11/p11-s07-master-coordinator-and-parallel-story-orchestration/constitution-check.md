# Constitution Check

- [x] New modules respect SRP and dependency direction. The master coordinator,
  worker scheduling, dependency resolution, and task apply policy remain
  distinct layers.
- [x] Backwards compatibility is planned. Current `ultimate mode`, direct turns,
  and plan queues remain available while orchestration grows behind explicit
  runtime entry points.
- [x] Testing strategy covers the change. Scheduling, dependency blocking,
  lease-aware assignment, human interrupts, and resume behavior all need
  dedicated coverage.
- [x] New dependency risk is bounded. Initial orchestration should reuse
  existing runtime contracts and isolated task foundations rather than
  introducing a heavyweight external scheduler.
