---
name: test-suite-gen
description: >
  Generate a multi-layer test suite following the research-validated strategy: permission
  matrix tests, integration tests, service unit tests, frontend component tests, and edge
  case tests. Use this skill when the user says "generate tests", "create test suite",
  "write tests for [entity]", "add test coverage", or when running the factory pipeline's
  test stage. Also trigger for "test this feature", "add tests", "what tests do we need",
  or any request to generate comprehensive tests for generated or existing code. Produces
  tests that follow the project's existing test conventions and framework.
---

# Test Suite Generator — Layered Testing Strategy

## Purpose

No individual testing method exceeds 50% defect detection alone (Capers Jones, 13,000+
projects). Only layered combinations cross 95%. This skill generates a multi-layer test
suite that maximizes defect removal by combining complementary testing strategies.

## Prerequisites

Load from `.factory/current/`:
- `feature-model.json` — entity definition, integrations, permissions
- `schema-contract.json` — field types, constraints, sensitive fields
- `api-contract.json` — endpoints, DTOs, permissions per route
- Generated source files from `api-gen` and `frontend-gen`

Load from `.factory/`:
- `CONSTITUTION.md` — test framework, conventions, file naming
- `quality-profile.json` — test runner config, coverage requirements

## Test Framework Detection

From the constitution and quality profile, identify:
- **Runner**: Jest? Vitest? Mocha? Pytest? Go test?
- **Assertion style**: expect()? assert? should?
- **Mocking**: jest.mock? vi.mock? sinon? testdouble?
- **HTTP testing**: supertest? httpx? net/http/httptest?
- **DB testing**: Testcontainers? in-memory SQLite? test transactions?
- **Frontend testing**: React Testing Library? Enzyme? Cypress component?
- **File naming**: `.test.ts`? `.spec.ts`? `__tests__/`?
- **Describe/it nesting**: how deep? what grouping pattern?

Copy the exemplar's test file structure exactly.

## The Five Test Layers

### Layer 1: Permission Matrix Tests (Highest Compliance Value)

For every endpoint × role combination, generate a test:

```
ENDPOINT          ROLE              EXPECTED
GET    /          admin             200
GET    /          merchant_owner    200
GET    /          viewer            403
GET    /          unauthenticated   401
POST   /          admin             201
POST   /          merchant_owner    201
POST   /          viewer            403
DELETE /:id       admin             200
DELETE /:id       merchant_owner    200
DELETE /:id       viewer            403
```

Generate as data-driven tests (parametrized/each pattern):

```typescript
// Example pattern — adapt to project's test framework
describe('PaymentMethod permissions', () => {
  const matrix = [
    { method: 'GET', path: '/', role: 'admin', expected: 200 },
    { method: 'GET', path: '/', role: 'viewer', expected: 403 },
    // ... all combinations
  ];

  it.each(matrix)('$method $path as $role → $expected', async ({ method, path, role, expected }) => {
    const res = await request(app)[method.toLowerCase()](path)
      .set('Authorization', tokenFor(role));
    expect(res.status).toBe(expected);
  });
});
```

Also test: **denied attempts are audit-logged** (if audit is enabled).

### Layer 2: Service Unit Tests

For each service method, test:

**Happy path**: valid input → expected output
**Validation**: invalid input → appropriate error
**Not found**: non-existent ID → NotFoundException
**Edge cases**: from field constraints (empty enum, max-length strings, null handling)

For `create()`:
```
✅ Creates entity with valid input
✅ Returns response DTO (excludes sensitive fields)
✅ Calls VaultClient for sensitive fields (if vault integration)
✅ Calls AuditService.log (if audit integration)
❌ Rejects missing required fields
❌ Rejects invalid enum values
❌ Rejects duplicate [unique constraint] values
```

For `update()`:
```
✅ Updates existing entity
✅ Returns updated response DTO
✅ Logs update event with diff
❌ Throws NotFoundException for invalid ID
❌ Rejects invalid field values
```

For `delete()`:
```
✅ Deletes existing entity
✅ Logs deletion event
❌ Throws NotFoundException for invalid ID
```

For custom methods (e.g., `setDefault()`):
```
✅ Sets the specified method as default
✅ Unsets the previous default (mutual exclusivity)
✅ Logs the change
```

### Layer 3: Integration Tests (with real database)

If the project uses Testcontainers or test database:

```
✅ Full CRUD flow against real database
✅ Pagination returns correct subset
✅ Filtering works for each filterable field
✅ Transaction rollback on error (e.g., Vault failure mid-create)
✅ Concurrent operations don't corrupt data
✅ Foreign key constraints enforced
✅ CHECK constraints enforced at DB level
```

If no Testcontainers setup exists, generate tests with the project's existing DB test
pattern (could be in-memory SQLite, test schema, or mocked repository).

### Layer 4: Frontend Component Tests

For each UI component, test:

**List component:**
```
✅ Renders loading skeleton initially
✅ Renders data after fetch
✅ Renders empty state when no data
✅ Renders error state on fetch failure
✅ Pagination controls work
✅ Sort triggers refetch
✅ Delete button hidden when no permission
```

**Form component:**
```
✅ Renders all form fields
✅ Validation errors display on invalid input
✅ Submit sends correct payload
✅ Pre-populates fields in edit mode
✅ Disables submit button during loading
✅ Shows success feedback after save
```

**Detail component:**
```
✅ Renders entity data
✅ Shows loading state
✅ Shows not-found for invalid ID
✅ Delete confirmation modal works
✅ Sensitive fields not displayed (or masked)
```

### Layer 5: Edge Case / Property-Based Tests (if applicable)

For complex business logic:
- Enum boundary testing (every value in the enum)
- String length boundaries (at max length, over max length)
- Boolean toggle behavior (is_default mutual exclusivity)
- Concurrent modification handling
- Empty string vs null distinction

## Test Generation Process

### Step 1: Read exemplar tests

Find the exemplar's test files. Copy:
- File structure and organization
- Describe/it nesting pattern
- Setup/teardown approach (beforeAll, beforeEach, afterAll)
- Helper functions and fixtures
- Mock setup patterns

### Step 2: Generate test files

For each layer, generate tests following the exemplar's exact patterns.
Substitute entity names, field names, and types.

### Step 3: Verify

```bash
# Run the test suite
npm test -- --testPathPattern=payment-method 2>&1

# Check coverage
npm test -- --coverage --testPathPattern=payment-method 2>&1
```

Target: all tests passing, >85% line coverage on generated code.

If tests fail:
1. Parse the error
2. Fix the test (usually a mock setup issue or import path)
3. Re-run
4. Max 3 retries per test file

## Output Files

```
.factory/current/
├── generated/
│   ├── tests/
│   │   ├── payment-method.permissions.test.ts
│   │   ├── payment-method.service.test.ts
│   │   ├── payment-method.integration.test.ts
│   │   ├── PaymentMethodList.test.tsx
│   │   ├── PaymentMethodForm.test.tsx
│   │   └── PaymentMethodDetail.test.tsx
│   └── fixtures/
│       └── payment-method.fixtures.ts
└── test-verification.md (pass/fail results, coverage)
```

## Honest Limitations

- **Generated tests can't verify business logic correctness.** They verify structural
  behavior (returns 200, calls the right service, renders the right fields). Semantic
  correctness ("does setDefault actually make sense for this domain?") requires human QA.
- **Don't write tests for tests' sake.** If a test just checks that a mock was called
  with the exact arguments you told it to expect, it tests the mock, not the code.
  Focus on behavior, not implementation details.
- **Integration tests are the most valuable, unit tests are the most fragile.** Prioritize
  getting integration tests right over maximizing unit test count.
