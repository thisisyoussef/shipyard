# Ship Clone Final Demo Script

This script is written for a first-take recording. If you lose your place,
read the `Say` lines verbatim and treat the `Tech note` lines as optional
background you can paraphrase.

This walkthrough is mapped against the local `../ship-promptpack-ultimate`
target. The same flow also works for `../ship-promptpack-vercel-snapshot`;
`src/main.tsx`, `src/App.tsx`, and `src/store.ts` match across both copies.

## Goal

Show three things in one pass:

- the rebuilt Ship clone has real product breadth, not just one polished screen
- Shipyard can make a surgical edit to that target with a visible diff
- the edit is traceable through live execution, command/output evidence, and
  the turn trace

## Pre-Recording Setup

From the repo root:

```bash
pnpm --dir shipyard install
pnpm --dir shipyard build
pnpm --dir ../ship-promptpack-ultimate install
pnpm --dir ../ship-promptpack-ultimate dev
SHIPYARD_UI_PORT=3211 pnpm --dir shipyard start -- --target ../ship-promptpack-ultimate --ui --session ship-clone-final-demo
```

If you are using `../ship-promptpack-vercel-snapshot` instead, swap that path
into the last two commands.

Recommended recording layout:

- one browser tab on the Ship clone app at `http://localhost:5173/dashboard`
- one browser tab on the Shipyard workbench at the printed local URL
- keep the Dashboard page open before you ask for the live edit
- if the browser workbench distorts after the first chat query, refresh once
  and continue; the session should rehydrate

## Script

### 1. Cold Open

Do:

- start on the Ship clone dashboard

Say:

> "I’m going to show two things in one pass: the Ship clone we built locally,
> and the agent workflow we used to iterate on it. This is a real local app,
> not a static mock, and then I’ll use Shipyard to make one small audited
> change live."

Tech note:

The product route tree is wired in `src/main.tsx`, and the app shell groups the
surface into Overview, Work, Team, and Admin in `src/App.tsx`.

### 2. Show the Shell and Dashboard

Do:

- point at the sidebar groups
- point at the dashboard hero, goals snapshot, and section counts

Say:

> "Now let’s open the main shell. We have Dashboard and My Week under
> Overview, then Docs, Issues, Projects, and Programs under Work, plus Team,
> Settings, and Admin. So this rebuild is covering the whole operating model,
> not just one page."
>
> "On the dashboard, the current week is the anchor. You can already see the
> planning state, weekly goals, and direct entry points into My Week and the
> week document."

Tech note:

The dashboard pulls the current planning or active week from seeded data in
`src/store.ts` and turns it into a weekly operating summary in
`src/pages/Dashboard.tsx`.

### 3. Open My Week

Do:

- click `My Week`

Say:

> "Now let’s open My Week. This is the weekly operating surface. Instead of
> just listing documents, it turns the week into a working view with progress,
> checkpoints, signals, blockers, and review structure."
>
> "This is important because it feels like a system for running the week, not
> just storing notes about the week."

Tech note:

`src/pages/MyWeek.tsx` is explicitly organized around sections like `How this
week is running`, `Standups and review checkpoints`, and `Signals shaping next
week`.

### 4. Open a Live Work Item

Do:

- click `Issues`
- open `Fix timezone offset in calendar widget`
- point at the tabs

Say:

> "Now let’s look at a live work item. I’m opening `Fix timezone offset in
> calendar widget`. The important thing here is that the detail surface changes
> shape based on the entity type."
>
> "For an issue, I get Description, Comments, Activity, and Linked Items. So
> the product is using one canonical detail route, but it still respects the
> type of the object I’m looking at."

Tech note:

The canonical detail route is `/documents/:id`, and
`src/pages/DocumentDetail.tsx` swaps the tab model based on whether the item is
a doc, issue, project, program, or week.

### 5. Show Breadth Quickly

Do:

- click `Projects` and point at `Onboarding Redesign`
- click `Programs` and point at `H2 Platform Reliability`
- click `Team Directory` or `Team Allocation`
- click `Settings` or `Admin`

Say:

> "Now I’ll do a quick breadth pass. Projects, programs, team surfaces,
> settings, and admin are all part of the same rebuild."
>
> "That matters because this is not just a design exercise. It’s a full
> Ship-style product shell with execution views, people views, and workspace
> administration."

Tech note:

The route inventory in `src/main.tsx` includes dashboard, weekly views, all
four work object types, five team routes, settings, conversions, admin, auth,
and program feedback.

### 6. Switch to Shipyard

Do:

- switch to the Shipyard workbench tab for the same target

Say:

> "Now I’m switching from the product itself to the operator surface that built
> it. This is the same local target loaded into Shipyard."
>
> "The conversation lives on the left, and the file changes plus command output
> live on the right, so I can watch the response and the code impact at the
> same time."

Tech note:

The current browser shell is composed in
`shipyard/ui/src/ShipyardWorkbench.tsx` with chat and composer on the left,
file/output evidence on the right, and session/run/context panels in the
drawer.

### 7. Ask for the Surgical Edit

Do:

- make sure the target app is still open on `/dashboard`
- paste this prompt into Shipyard and submit it

```text
Make a surgical copy edit in src/pages/Dashboard.tsx only.

Change the planning CTA text from "Open Week Document" to "Open Weekly Plan".
Change the guidance card heading from "Planning guidance" to "Planning playbook".

Keep the change to one file, explain it briefly, and stop there.
```

Say:

> "Now let’s ask it to edit something small on purpose. I want a surgical
> change that is easy to verify visually and easy to audit in the diff."
>
> "I’m giving it a narrow contract: one file, two text changes, no refactor."

Tech note:

This is the ideal demo case for the workbench: small scope, a visible UI
result, and a one-file diff that is easy to read on camera.

### 8. Follow the Live Execution

Do:

- keep the `Files` panel visible while the turn runs
- when `Dashboard.tsx` appears, click it
- point at the `Before`, `After`, and diff lines
- if the `Output` panel has command entries, expand one
- flip back to the app tab and show the updated dashboard text
- confirm the CTA now reads `Open Weekly Plan` and the card heading now reads
  `Planning playbook`

Say:

> "Now look at the run while it’s happening. On the right, Shipyard is telling
> me exactly which file it touched."
>
> "When I click the file entry, I get the before-and-after preview plus the
> actual diff lines. That’s the key behavior: the agent is not a black box
> here. I can inspect the exact edit."

Tech note:

`shipyard/ui/src/panels/FilePanel.tsx` renders before/after previews and
line-level diff entries, and `shipyard/ui/src/panels/OutputPanel.tsx` keeps
recent command output for the same turn.

### 9. Walk Through the Trace

Do:

- in the finished chat turn, click `Open trace`
- if you want one more proof point, open the drawer and point at `Previous
  runs`

Say:

> "This is the trace for the exact turn we just watched. So I’m not only
> seeing the final answer. I can connect the chat output, the file diff, and
> the execution record to the same run."
>
> "If I open the drawer, I also get previous runs and session context, which
> makes this feel like a real operator workbench instead of a one-shot prompt
> box."

Tech note:

The turn-level `Open trace` link is rendered from the chat surface, and saved
sessions appear under `Previous runs` in the drawer.

### 10. Close With the Verdict

Do:

- end on the updated dashboard or on the Shipyard diff pane

Say:

> "So that’s the full story. The target already has real Ship-style product
> breadth across weekly planning, work tracking, team views, and admin
> surfaces, and Shipyard can make a small change to it live with a visible diff
> and traceable execution."
>
> "The one rough edge I’ve seen is that the browser workbench can distort after
> the first chat query. That’s worth fixing, but the core workflow is working,
> and overall this is a pass."

## Backup Prompt

If the recommended Dashboard edit drifts or takes too broad a path, use this
smaller fallback instead:

```text
Make a surgical copy edit in src/App.tsx only.

Rename the Team nav item "Directory" to "People Directory".

Keep the change to one file and stop there.
```

## Mapped From Source

- `../ship-promptpack-ultimate/src/main.tsx`
- `../ship-promptpack-ultimate/src/App.tsx`
- `../ship-promptpack-ultimate/src/store.ts`
- `../ship-promptpack-ultimate/src/pages/Dashboard.tsx`
- `../ship-promptpack-ultimate/src/pages/MyWeek.tsx`
- `../ship-promptpack-ultimate/src/pages/DocumentDetail.tsx`
- `shipyard/ui/src/ShipyardWorkbench.tsx`
- `shipyard/ui/src/panels/FilePanel.tsx`
- `shipyard/ui/src/panels/ChatWorkspace.tsx`
- `shipyard/ui/src/panels/RunHistoryPanel.tsx`
