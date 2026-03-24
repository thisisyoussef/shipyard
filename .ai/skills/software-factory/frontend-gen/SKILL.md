---
name: frontend-gen
description: >
  Generate frontend components (list, form, detail views) by copying the structure of the
  selected exemplar's UI and adapting it for the new entity, using the API Contract for
  type safety. Use this skill when the user says "generate frontend", "create components",
  "build the UI", "generate React components", "create the pages for [entity]", or when
  running the factory pipeline's frontend stage. Also trigger for "add UI for [feature]",
  "create list/form/detail view", or any request to generate client-side code following
  existing project conventions. Works with React, Vue, Svelte, or Angular — copies whatever
  the exemplar uses.
---

# Frontend Generator — Exemplar-Driven UI Components + API Contract

## Purpose

Generate frontend components by structurally copying the exemplar's UI code and adapting
it for the new entity. Uses the API Contract to ensure type alignment between frontend
and backend without manual coordination.

## Prerequisites

Load from `.factory/current/`:
- `feature-model.json` — frontend file paths, UI configuration
- `api-contract.json` — endpoints, DTO types, permissions

Load from `.factory/`:
- `CONSTITUTION.md` — component conventions, styling approach
- `exemplars/[primary-exemplar].md` — which exemplar UI files to copy from

## Component Generation Strategy

### Identify UI Framework and Patterns

From the constitution, determine:
- **Framework**: React (functional? class?), Vue (Options? Composition?), Svelte, Angular
- **State management**: React Query? SWR? Redux? Zustand? Pinia? None?
- **Styling**: Tailwind? CSS Modules? Styled Components? SCSS?
- **Component library**: shadcn/ui? MUI? Ant Design? Custom?
- **Form handling**: React Hook Form? Formik? Native? Zod validation?
- **Routing**: React Router? Next.js? Tanstack Router?

### Read Exemplar Components

For each component type the feature model requests (`list`, `form`, `detail`), find
and read the corresponding exemplar component. Copy the EXACT patterns:

- Import organization
- Hook usage order
- Loading state handling
- Error state handling
- Empty state handling
- Permission-gated rendering
- Data fetching pattern
- Form validation approach

## Generation by Component Type

### List Component

From the exemplar's list component, adapt:

```
[EntityName]List.tsx (or .vue, .svelte)
├── Data fetching (from API Contract: GET / endpoint)
├── Column definitions (from Schema Contract: response DTO fields)
├── Sorting (copy exemplar's sort implementation)
├── Filtering (if exemplar has filters)
├── Pagination (copy exemplar's pagination pattern)
├── Row actions (edit, delete, set-default if applicable)
├── Permission gates (from API Contract: endpoint permissions)
├── Loading skeleton (copy exemplar's loading state)
├── Empty state (copy exemplar's empty state)
└── Error boundary (copy exemplar's error handling)
```

Key rules for list:
- **Exclude sensitive fields** from list columns (check `in_response_dto` in schema contract)
- **Match the exemplar's table/card layout** — don't switch between them
- **Copy pagination implementation exactly** — offset? cursor? infinite scroll?

### Form Component

From the exemplar's form component, adapt:

```
[EntityName]Form.tsx
├── Form library setup (copy exemplar: React Hook Form? Formik?)
├── Validation schema (from Schema Contract: field types + constraints)
│   ├── Required fields (NOT NULL in schema)
│   ├── Enum validation (CHECK constraints)
│   ├── Length limits (VARCHAR size)
│   └── Custom validation (business rules from feature model)
├── Field rendering (copy exemplar's field component patterns)
│   ├── Text inputs → string fields
│   ├── Select/dropdown → enum fields
│   ├── Checkbox/toggle → boolean fields
│   ├── Sensitive field handling (masked input? separate flow?)
│   └── Hidden fields (vault_ref — not user-editable?)
├── Submit handler (POST or PATCH from API Contract)
├── Error display (copy exemplar's error pattern)
└── Loading/disabled states
```

Key rules for form:
- **Use the exemplar's validation library and patterns** — don't introduce Zod if the
  exemplar uses Yup
- **Distinguish create vs edit** — create sends POST, edit sends PATCH
- **Pre-populate on edit** — fetch existing data and fill form
- **Sensitive fields**: determine from feature model if they're user-editable or system-managed

### Detail Component

From the exemplar's detail component, adapt:

```
[EntityName]Detail.tsx
├── Data fetching (GET /:id from API Contract)
├── Field display (response DTO fields, formatted)
├── Action buttons (edit, delete — permission-gated)
├── Delete confirmation (copy exemplar's modal/dialog pattern)
├── Related data (if feature model specifies relations)
├── Loading state
└── Not found handling
```

### Route Registration

Add routes following the exemplar's routing pattern:
```typescript
// Copy the exemplar's route structure
{ path: '/payment-methods', component: PaymentMethodList },
{ path: '/payment-methods/new', component: PaymentMethodForm },
{ path: '/payment-methods/:id', component: PaymentMethodDetail },
{ path: '/payment-methods/:id/edit', component: PaymentMethodForm },
```

### Navigation Entry

If the project has a sidebar/nav config, add the new entity:
```typescript
// Copy the exemplar's nav entry pattern
{ label: 'Payment Methods', path: '/payment-methods', icon: CreditCardIcon, permission: 'payment_methods:manage' },
```

## API Client / Hooks Generation

Generate the data-fetching layer matching the exemplar:

```typescript
// If using React Query / custom hooks pattern:
export const usePaymentMethods = (params?: ListParams) =>
  useQuery(['payment-methods', params], () => api.get('/payment-methods', { params }));

export const usePaymentMethod = (id: string) =>
  useQuery(['payment-methods', id], () => api.get(`/payment-methods/${id}`));

export const useCreatePaymentMethod = () =>
  useMutation((data: CreatePaymentMethodDto) => api.post('/payment-methods', data));
// etc.
```

## Verification

```bash
# TypeScript compilation
npx tsc --noEmit 2>&1

# Linting
npx eslint src/components/payment-methods/ 2>&1

# Convention diff: compare component structure with exemplar
# - Same number of hooks?
# - Same loading/error pattern?
# - Same styling approach?
```

## Output Files

```
.factory/current/
├── generated/
│   ├── components/
│   │   ├── [EntityName]List.tsx
│   │   ├── [EntityName]Form.tsx
│   │   └── [EntityName]Detail.tsx
│   ├── hooks/
│   │   └── use[EntityName].ts  (or api client file)
│   └── routes/
│       └── route-patch.ts  (additions to route config)
└── frontend-verification.md
```

## Critical Rules

- **Never introduce a new library.** If the exemplar uses React Hook Form, use React Hook
  Form. If it uses native form handling, use native form handling. Zero new dependencies.
- **Match the exemplar's component size.** If the exemplar's list component is 120 lines,
  yours should be roughly 120 lines. Dramatic size differences signal structural drift.
- **Feature flag the UI.** Wrap new routes/nav entries in the feature flag check from
  config-gen.
- **Permission-gate everything.** If the API endpoint requires a permission, the UI button
  that calls it should check the same permission.
