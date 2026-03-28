# Shipyard UI Integration Architecture

**Purpose:** This document describes how to wire the new UI components (Dashboard, Editor, Kanban, Ultimate Mode controls) into the existing Shipyard backend. It is designed for a senior SWE to review, refine, and implement.

**Current state:** All UI components exist as standalone React components with mock data in `shipyard/ui/src/views/` and `shipyard/ui/src/shell/`. They can be previewed at `/preview.html`. The existing App.tsx (1136 lines) remains untouched — the production app still renders the old single-view workbench.

---

## 1. Problem Statement

`App.tsx` is a 1136-line monolith that handles:
- Hosted access gating (token auth)
- WebSocket connection lifecycle (connect, reconnect, message parsing)
- Workbench state management (turns, files, sessions, targets, uploads)
- Keyboard shortcuts
- File upload HTTP requests
- Instruction submission with context injection
- Ultimate mode text-command passthrough
- Composer state (instruction, context draft, notices, attachments)
- Page routing (pathname-based: workbench vs human-feedback)
- Rendering (delegates to `ShipyardWorkbench` or `HumanFeedbackPage`)

This needs to be decomposed so:
1. Three views can share the same WebSocket + state
2. Each view receives only the state it needs
3. New message types (`ultimate:*`, `board:*`) are handled
4. Routing moves from pathname-based to hash-based

---

## 2. Proposed Architecture

### 2.1 Extract `useWorkbench` Hook

The core refactor: extract everything except rendering from `App.tsx` into a `useWorkbench()` custom hook.

```
┌─────────────────────────────────────────────────────┐
│  App.tsx (thin shell)                               │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  useWorkbench()                               │  │
│  │  ├─ WebSocket lifecycle                       │  │
│  │  ├─ WorkbenchViewState reducer                │  │
│  │  ├─ UltimateModeState                         │  │
│  │  ├─ BoardState                                │  │
│  │  ├─ Composer state + submission               │  │
│  │  ├─ File upload handlers                      │  │
│  │  ├─ Keyboard shortcuts                        │  │
│  │  └─ Action creators (sendMessage wrappers)    │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  useRouter()  ───→  route dispatch                  │
│                                                     │
│  ┌──────────────────┐                               │
│  │  NavBar           │  ← always rendered            │
│  ├──────────────────┤                               │
│  │  route.view ===   │                               │
│  │  "dashboard"  → DashboardView(targetManager)     │
│  │  "editor"     → EditorView(full workbench state) │
│  │  "board"      → KanbanView(boardState)           │
│  │  "human-fb"   → HumanFeedbackPage(...)           │
│  └──────────────────┘                               │
└─────────────────────────────────────────────────────┘
```

**File:** `shipyard/ui/src/use-workbench.ts`

**Returns:**

```typescript
interface UseWorkbenchReturn {
  // Connection
  connectionState: WorkbenchConnectionState;
  sendMessage: (msg: FrontendToBackendMessage) => boolean;

  // Workbench state (existing)
  viewState: WorkbenchViewState;
  deferredTurns: TurnViewModel[];
  deferredFileEvents: FileEventViewModel[];
  deferredContextHistory: ContextReceiptViewModel[];

  // Composer state
  instruction: string;
  contextDraft: string;
  composerNotice: ComposerNotice | null;
  composerAttachments: ComposerAttachment[];
  instructionInputRef: RefObject<HTMLTextAreaElement | null>;
  contextInputRef: RefObject<HTMLTextAreaElement | null>;
  onInstructionChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onInstructionKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onContextKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onClearContext: () => void;
  onSubmitInstruction: (event: FormEvent<HTMLFormElement>) => void;
  onCancelInstruction: () => void;

  // File uploads
  onAttachFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;

  // Actions
  onRequestTargetSwitch: (targetPath: string) => void;
  onRequestTargetCreate: (input: TargetCreateInput) => void;
  onRequestSessionResume: (sessionId: string) => void;
  onActivateProject: (projectId: string) => void;
  onRefreshStatus: () => void;
  onCopyTracePath: () => void;
  traceButtonLabel: string;

  // Sidebar state
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;

  // NEW: Ultimate mode
  ultimateState: UltimateModeUIState;
  onUltimateToggle: (enabled: boolean, brief?: string) => void;
  onUltimateFeedback: (text: string) => void;
  onUltimateStop: () => void;

  // NEW: Board state
  boardState: BoardUIState;

  // Access gating
  accessState: HostedAccessState;
  accessToken: string;
  accessSubmitting: boolean;
  onAccessTokenChange: (value: string) => void;
  onAccessSubmit: (event: FormEvent<HTMLFormElement>) => void;
  hasUnlockedAccess: boolean;
}
```

### 2.2 New State Types

```typescript
// Ultimate mode UI state (derived from backend messages)
interface UltimateModeUIState {
  active: boolean;
  turnCount: number;
  currentBrief: string | null;
  composerToggleEnabled: boolean;  // local toggle state before activation
}

// Board UI state (derived from backend messages)
interface BoardUIState {
  taskStates: TaskStateDefinition[];
  tasks: TaskCardViewModel[];
  stories: StoryViewModel[];
}
```

### 2.3 New App.tsx (Thin Shell)

After extraction, `App.tsx` becomes ~80-100 lines:

```typescript
export function App() {
  const workbench = useWorkbench();
  const { route, navigate } = useRouter();

  if (!workbench.hasUnlockedAccess) {
    return <HostedAccessGate ... />;
  }

  return (
    <>
      <NavBar
        currentView={route.view}
        onNavigate={navigate}
        ultimateActive={workbench.ultimateState.active}
        onUltimateClick={() => { /* open badge dropdown */ }}
      />
      <UltimateBadge
        active={workbench.ultimateState.active}
        turnCount={workbench.ultimateState.turnCount}
        currentBrief={workbench.ultimateState.currentBrief}
        onSendFeedback={workbench.onUltimateFeedback}
        onStop={workbench.onUltimateStop}
      />

      {route.view === "dashboard" && (
        <DashboardView
          targetManager={workbench.viewState.targetManager}
          onNavigate={navigate}
          onCreateProduct={workbench.onRequestTargetCreate}
          onSubmitHeroPrompt={(prompt) => {
            // Create target from prompt, then navigate to editor
          }}
        />
      )}

      {route.view === "editor" && (
        <EditorView
          productId={route.productId}
          onNavigate={navigate}
          // ... pass workbench props to the embedded ShipyardWorkbench
          {...workbenchPropsForEditor(workbench)}
        />
      )}

      {route.view === "board" && (
        <KanbanView
          taskStates={workbench.boardState.taskStates}
          tasks={workbench.boardState.tasks}
          stories={workbench.boardState.stories}
        />
      )}

      {route.view === "human-feedback" && (
        <HumanFeedbackPage ... />
      )}
    </>
  );
}
```

---

## 3. Backend Changes Required

### 3.1 New WebSocket Message Schemas

Add to `shipyard/src/ui/contracts.ts`:

```typescript
// Frontend → Backend
ultimateToggleMessageSchema    { type: "ultimate:toggle", enabled: boolean, brief?: string }
ultimateFeedbackMessageSchema  { type: "ultimate:feedback", text: string }

// Backend → Frontend
ultimateStateMessageSchema     { type: "ultimate:state", active: boolean, turnCount: number, currentBrief: string | null }
boardStateMessageSchema        { type: "board:state", taskStates: TaskStateDefinition[], tasks: TaskCardViewModel[], stories: StoryViewModel[] }
```

Add these to the respective discriminated unions (`frontendToBackendMessageSchema`, `backendToFrontendMessageSchema`).

### 3.2 Server-Side Message Handlers

In `shipyard/src/ui/server.ts`, add handlers in the WebSocket message switch:

```typescript
case "ultimate:toggle": {
  if (message.enabled && message.brief) {
    // Equivalent to user typing "ultimate start <brief>"
    // Call parseUltimateModeCommand and executeUltimateMode
  } else if (!message.enabled) {
    // Equivalent to "ultimate stop"
  }
  // Broadcast ultimate:state to client
  break;
}

case "ultimate:feedback": {
  // Equivalent to "ultimate feedback <text>"
  // Call controller.enqueueHumanFeedback(message.text)
  break;
}
```

### 3.3 Board State Broadcasting

This is the most architecturally significant new backend capability. Options:

**Option A: Derive from turn history (minimal backend change)**
- Map existing turns/tool calls to task cards
- Each turn becomes a task, its status becomes the state
- Agent name from the turn becomes `agentId`
- No new storage — purely computed from session state

**Option B: Explicit task model (new backend module)**
- New `shipyard/src/board/` module with task CRUD
- Tasks persist in session state alongside turns
- Agents explicitly create/move tasks via tool calls or internal API
- Richer data but requires engine changes

**Recommendation:** Start with **Option A** for v1. The board is a view over existing data, not a new data model. The `board:state` message is computed from `SessionState.turns` + phase info. When the multi-agent coordinator arrives in v2, upgrade to Option B.

### 3.4 Workbench State Reducer Extension

In `shipyard/src/ui/workbench-state.ts`:

```typescript
// Add to WorkbenchViewState
ultimateState: UltimateModeUIState;
boardState: BoardUIState;

// Add cases to applyBackendMessage
case "ultimate:state":
  return { ...state, ultimateState: { active: msg.active, turnCount: msg.turnCount, currentBrief: msg.currentBrief, composerToggleEnabled: state.ultimateState.composerToggleEnabled } };

case "board:state":
  return { ...state, boardState: { taskStates: msg.taskStates, tasks: msg.tasks, stories: msg.stories } };
```

---

## 4. Integration Sequence

### Phase 1: Extract useWorkbench (prerequisite for everything)

| Step | Action | Risk |
|------|--------|------|
| 1 | Create `use-workbench.ts` with the entire body of `App()` except the JSX return | Low — pure move |
| 2 | Replace `App.tsx` body with `const wb = useWorkbench()` + JSX | Low — same behavior |
| 3 | Verify existing tests + manual smoke test | Gate |

**Acceptance:** The existing workbench renders identically. No new features, no regressions.

### Phase 2: Add routing

| Step | Action | Risk |
|------|--------|------|
| 1 | Add `useRouter()` to the new thin `App.tsx` | Low |
| 2 | Add `NavBar` above the view dispatch | Low |
| 3 | Replace pathname routing with hash routing | Medium — URL change |
| 4 | Wire `DashboardView` for `#/` route | Low |
| 5 | Wire existing `ShipyardWorkbench` via `EditorView` for `#/editor/:id` | Medium — prop threading |
| 6 | Wire `KanbanView` (with empty/mock data initially) for `#/board` | Low |

**Acceptance:** Navigating between views works. Editor view shows the same workbench as before when a product is selected.

### Phase 3: Connect EditorView to real data

| Step | Action | Risk |
|------|--------|------|
| 1 | Replace mock chat in `EditorView` with real `ChatWorkspace` + `ComposerPanel` | Medium |
| 2 | Wire workspace tabs to real `PreviewPanel`, `FilePanel` | Low |
| 3 | Wire `CodeTab` to a new `/api/files/read` HTTP endpoint | Medium — new endpoint |
| 4 | Add `UltimateToggle` to `ComposerPanel` | Low |
| 5 | Thread ultimate toggle state through useWorkbench | Low |

**Acceptance:** Editor view shows real agent conversation, file diffs, preview. Code tab reads actual files.

### Phase 4: Backend contract extensions

| Step | Action | Risk |
|------|--------|------|
| 1 | Add Zod schemas for `ultimate:*` and `board:*` messages | Low |
| 2 | Add message handlers in `server.ts` | Medium |
| 3 | Add `ultimate:state` broadcasting after mode transitions | Medium |
| 4 | Implement Option A board state derivation from turns | Medium |
| 5 | Extend workbench-state reducer | Low |

**Acceptance:** Ultimate mode toggle works end-to-end. Board shows tasks derived from session turns.

### Phase 5: Dashboard to real data

| Step | Action | Risk |
|------|--------|------|
| 1 | Map `TargetManagerViewModel.availableTargets` to `ProductCardData[]` | Low |
| 2 | Add `lastActivity` and `previewThumbnail` to target state | Low |
| 3 | Wire hero prompt to create a new target + navigate to editor | Low |
| 4 | Wire product card click to navigate to `#/editor/:productId` | Low |

**Acceptance:** Dashboard shows real products, clicking one opens the editor.

---

## 5. File Change Map

### New files
| File | Purpose |
|------|---------|
| `shipyard/ui/src/use-workbench.ts` | Extracted hook — WebSocket, state, actions |
| `shipyard/src/board/derive-board.ts` | Compute board state from session turns |

### Major modifications
| File | Change |
|------|--------|
| `shipyard/ui/src/App.tsx` | Gut to ~100 lines — useWorkbench + useRouter + view dispatch |
| `shipyard/src/ui/contracts.ts` | Add `ultimate:*` and `board:*` schemas to both unions |
| `shipyard/src/ui/workbench-state.ts` | Add `ultimateState` + `boardState` to state + reducer |
| `shipyard/src/ui/server.ts` | Add handlers for `ultimate:toggle`, `ultimate:feedback`; broadcast `board:state` |
| `shipyard/ui/src/views/EditorView.tsx` | Replace mock data with real component props |
| `shipyard/ui/src/views/DashboardView.tsx` | Replace mock mapping with real `TargetManagerViewModel` |
| `shipyard/ui/src/views/KanbanView.tsx` | Remove mock data, accept props from `useWorkbench` |
| `shipyard/ui/src/panels/ComposerPanel.tsx` | Add `ultimateEnabled` + `onUltimateToggle` props |

### Unchanged
| File | Why |
|------|-----|
| `shipyard/ui/src/ShipyardWorkbench.tsx` | Stays as-is, used inside EditorView |
| All panel components (Chat, Activity, Session, etc.) | No changes — they receive same props |
| All CSS files | No changes — new components use existing tokens |
| `shipyard/ui/src/primitives.tsx` | No changes |
| `shipyard/ui/src/socket-manager.ts` | No changes |

---

## 6. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| App.tsx extraction breaks existing behavior | High | Phase 1 is a pure refactor — test before adding features |
| Hash routing breaks existing URL bookmarks | Low | Old workbench used pathname `/` — redirect `#/` maps cleanly |
| Board state derivation produces poor UX | Medium | Start with Option A (computed from turns), iterate |
| `useWorkbench` hook grows too large | Medium | Can split into `useConnection`, `useComposer`, `useUltimate` later |
| Race condition between route change and WebSocket state | Low | State is global (hook-level), not per-view |
| File read endpoint exposes filesystem | High | Restrict reads to target directory only, validate paths |

---

## 7. Testing Strategy

| Layer | Approach |
|-------|----------|
| Router | Unit tests (already done — `tests/ui/router.test.ts`) |
| useWorkbench | Existing tests cover `workbench-state.ts` reducer. Add tests for new message types. |
| View components | Snapshot tests or visual regression via preview harness |
| Board derivation | Unit tests for `derive-board.ts` — given turns, assert task cards |
| Ultimate mode messages | Schema validation tests (like existing contract tests) |
| End-to-end | Manual: start Shipyard, navigate between views, trigger ultimate mode |

---

## 8. Open Questions for Reviewer

1. **useWorkbench granularity:** Should the extracted hook be a single `useWorkbench()` or split into `useConnection()` + `useComposer()` + `useUltimate()` + `useBoardState()`? Single hook is simpler but larger (~800 lines).

2. **Router library:** The plan uses a hand-rolled hash router (23 lines). Is this sufficient, or should we adopt a minimal router like `wouter` (3KB gzipped) for features like route guards, transitions, and nested routes?

3. **Board state source:** Option A (derive from turns) vs Option B (explicit task model). The design doc assumes A for v1. Does the senior SWE agree, or should we invest in B upfront?

4. **File read API security:** The Code tab needs a `/api/files/read?path=...` endpoint. What sandboxing constraints should apply? (Recommendation: restrict to target directory, reject `..` traversal, limit file size.)

5. **EditorView ↔ ShipyardWorkbench boundary:** EditorView wraps ShipyardWorkbench. Should the existing ShipyardWorkbench be refactored to accept children/slots, or should EditorView compose around it?

6. **Preview thumbnails:** Where/when should preview screenshots be captured for dashboard cards? Options: on session end, on deploy, on explicit user action, or periodically.
