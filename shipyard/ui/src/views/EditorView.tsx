/**
 * EditorView — Main editing view with chat + workspace tabs.
 *
 * UIR-T05 — Editor View, Workspace Tabs, Code Tab
 *
 * Resizable split pane: left = mock chat, right = workspace tabs
 * (Preview, Code, Files). All data is mock — no backend wiring.
 */

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { Route } from "../router.js";
import { Badge } from "../primitives.js";

// ── Types ──────────────────────────────────────

interface EditorViewProps {
  productId: string;
  productName: string;
  scaffoldType: string;
  onNavigate: (route: Route) => void;
}

type WorkspaceTab = "preview" | "code" | "files";

interface FileTreeNode {
  name: string;
  type: "file" | "directory";
  path: string;
  children?: FileTreeNode[];
}

interface DiffHunkLine {
  type: "context" | "add" | "remove";
  content: string;
}

interface DiffHunk {
  lines: DiffHunkLine[];
}

interface DiffFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

// ── Mock Data ──────────────────────────────────

const MOCK_FILE_TREE: FileTreeNode[] = [
  {
    name: "src",
    type: "directory",
    path: "/src",
    children: [
      { name: "App.tsx", type: "file", path: "/src/App.tsx" },
      { name: "main.tsx", type: "file", path: "/src/main.tsx" },
      { name: "styles.css", type: "file", path: "/src/styles.css" },
    ],
  },
  { name: "package.json", type: "file", path: "/package.json" },
  { name: "tsconfig.json", type: "file", path: "/tsconfig.json" },
];

const MOCK_FILE_CONTENTS: Record<string, string> = {
  "/src/App.tsx": `import React from 'react';
import './styles.css';

function App(): JSX.Element {
  return (
    <div className="app">
      <h1>Hello Shipyard</h1>
      <p>Your product is running.</p>
    </div>
  );
}

export default App;`,
  "/src/main.tsx": `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(
  document.getElementById('root')!
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
  "/src/styles.css": `.app {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

h1 {
  font-size: 3.2em;
  line-height: 1.1;
}`,
  "/package.json": `{
  "name": "my-product",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}`,
  "/tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "strict": true,
    "jsx": "react-jsx",
    "moduleResolution": "bundler"
  },
  "include": ["src"]
}`,
};

const MOCK_DIFFS: DiffFile[] = [
  {
    path: "src/App.tsx",
    status: "modified",
    additions: 12,
    deletions: 3,
    hunks: [
      {
        lines: [
          { type: "context", content: "import React from 'react';" },
          { type: "remove", content: "- function App() {" },
          { type: "add", content: "+ function App(): JSX.Element {" },
          { type: "context", content: "  return (" },
          { type: "add", content: '+   <div className="app">' },
        ],
      },
    ],
  },
  {
    path: "src/styles.css",
    status: "added",
    additions: 8,
    deletions: 0,
    hunks: [
      {
        lines: [
          { type: "add", content: "+ .app {" },
          { type: "add", content: "+   max-width: 1280px;" },
          { type: "add", content: "+   margin: 0 auto;" },
          { type: "add", content: "+   padding: 2rem;" },
          { type: "add", content: "+ }" },
        ],
      },
    ],
  },
  {
    path: "package.json",
    status: "modified",
    additions: 2,
    deletions: 1,
    hunks: [
      {
        lines: [
          { type: "context", content: '  "scripts": {' },
          { type: "remove", content: '-   "start": "node index.js",' },
          { type: "add", content: '+   "dev": "vite",' },
          { type: "add", content: '+   "build": "tsc && vite build",' },
          { type: "context", content: "  }," },
        ],
      },
    ],
  },
];

interface MockChatTurn {
  role: "user" | "agent";
  text: string;
}

const MOCK_CHAT: MockChatTurn[] = [
  {
    role: "user",
    text: "Create a React app with TypeScript and Vite. Add a landing page with a hero section.",
  },
  {
    role: "agent",
    text: "I'll scaffold a React + TypeScript project using Vite. Let me set up the project structure with `App.tsx`, entry point, and base styles.\n\nCreating files:\n- `src/App.tsx` — main component with hero section\n- `src/main.tsx` — entry point\n- `src/styles.css` — base styles\n- `package.json` — dependencies\n- `tsconfig.json` — TypeScript config",
  },
  {
    role: "user",
    text: "Looks good. Can you also add a dark mode toggle?",
  },
  {
    role: "agent",
    text: "Sure! I'll add a dark mode toggle to the `App` component using a `useState` hook and CSS custom properties. The toggle will switch between light and dark themes by setting a `data-theme` attribute on the root element.",
  },
];

// ── Icons ──────────────────────────────────────

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="15,18 9,12 15,6" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22,2 15,22 11,13 2,9" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      className="code-tree-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      className="code-tree-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="code-tree-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.15s ease",
      }}
    >
      <polyline points="9,6 15,12 9,18" />
    </svg>
  );
}

// ── File Tree Component ────────────────────────

function FileTreeItem({
  node,
  depth,
  selectedPath,
  expandedDirs,
  onSelectFile,
  onToggleDir,
}: {
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  expandedDirs: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleDir: (path: string) => void;
}) {
  const isDir = node.type === "directory";
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (isDir) {
      onToggleDir(node.path);
    } else {
      onSelectFile(node.path);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <>
      <div
        className="code-tree-item"
        data-type={node.type}
        data-selected={isSelected}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="treeitem"
        aria-expanded={isDir ? isExpanded : undefined}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {isDir ? <ChevronIcon open={isExpanded} /> : <span className="code-tree-indent" />}
        {isDir ? <FolderIcon /> : <FileIcon />}
        <span>{node.name}</span>
      </div>
      {isDir && isExpanded && node.children
        ? node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedDirs={expandedDirs}
              onSelectFile={onSelectFile}
              onToggleDir={onToggleDir}
            />
          ))
        : null}
    </>
  );
}

// ── Tab Content Components ─────────────────────

function PreviewTab() {
  return (
    <div className="preview-placeholder">
      Preview will appear here when a dev server is running
    </div>
  );
}

function CodeTab() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    () => new Set(["/src"]),
  );

  const handleToggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const fileContent = selectedFile ? MOCK_FILE_CONTENTS[selectedFile] : null;
  const lines = fileContent ? fileContent.split("\n") : [];

  return (
    <div className="code-tab-split">
      <div className="code-tree" role="tree" aria-label="File tree">
        {MOCK_FILE_TREE.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedFile}
            expandedDirs={expandedDirs}
            onSelectFile={setSelectedFile}
            onToggleDir={handleToggleDir}
          />
        ))}
      </div>
      <div className="code-viewer">
        {selectedFile && fileContent != null ? (
          <>
            <div className="code-viewer-header">{selectedFile}</div>
            <div className="code-viewer-content">
              <pre>
                {lines.map((line, i) => (
                  <div key={i} className="code-viewer-line">
                    <span className="code-viewer-line-number">{i + 1}</span>
                    <span className="code-viewer-line-text">{line}</span>
                  </div>
                ))}
              </pre>
            </div>
          </>
        ) : (
          <div className="code-viewer-empty">
            Select a file to view its contents
          </div>
        )}
      </div>
    </div>
  );
}

function FilesTab() {
  return (
    <div className="files-tab-scroll">
      {MOCK_DIFFS.map((file) => (
        <div key={file.path} className="diff-file">
          <div className="diff-file-header">
            <span className="diff-file-path">{file.path}</span>
            <div className="diff-file-stats">
              <span className="diff-stat-add">+{file.additions}</span>
              <span className="diff-stat-del">-{file.deletions}</span>
            </div>
            <Badge
              tone={file.status === "added" ? "success" : "accent"}
            >
              {file.status.toUpperCase()}
            </Badge>
          </div>
          {file.hunks.map((hunk, hi) => (
            <div key={hi} className="diff-hunk">
              {hunk.lines.map((line, li) => (
                <div
                  key={li}
                  className={`diff-line diff-line--${line.type}`}
                >
                  <span className="diff-line-content">{line.content}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────

export function EditorView({
  productName,
  scaffoldType,
  onNavigate,
}: EditorViewProps) {
  const [splitRatio, setSplitRatio] = useState(40);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("code");
  const [isDragging, setIsDragging] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);

  // ── Resizable split pane ──────────────────────

  const handleDividerMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      setIsDragging(true);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!splitRef.current) return;
        const rect = splitRef.current.getBoundingClientRect();
        const x = moveEvent.clientX - rect.left;
        const ratio = Math.min(Math.max((x / rect.width) * 100, 20), 80);
        setSplitRatio(ratio);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [],
  );

  // Prevent text selection while dragging
  useEffect(() => {
    if (isDragging) {
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    } else {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDragging]);

  // ── Tab rendering ──────────────────────────────

  const tabs: { id: WorkspaceTab; label: string }[] = [
    { id: "preview", label: "Preview" },
    { id: "code", label: "Code" },
    { id: "files", label: "Files" },
  ];

  let tabContent: React.ReactNode;
  switch (activeTab) {
    case "preview":
      tabContent = <PreviewTab />;
      break;
    case "code":
      tabContent = <CodeTab />;
      break;
    case "files":
      tabContent = <FilesTab />;
      break;
  }

  return (
    <div className="editor-view">
      {/* Sub-header */}
      <div className="editor-subheader">
        <button
          className="editor-back-btn"
          onClick={() => onNavigate({ view: "dashboard" })}
          aria-label="Back to dashboard"
        >
          <ArrowLeftIcon />
        </button>
        <span className="editor-product-name">{productName}</span>
        <Badge tone="accent">{scaffoldType}</Badge>
      </div>

      {/* Split pane */}
      <div className="editor-split" ref={splitRef}>
        {/* Left pane — chat */}
        <div className="editor-left" style={{ flex: `0 0 ${splitRatio}%` }}>
          <div className="editor-chat-scroll">
            {MOCK_CHAT.map((turn, i) => (
              <div key={i} className={`chat-bubble chat-bubble--${turn.role}`}>
                <div className="chat-bubble-role">
                  {turn.role === "user" ? "You" : "Shipyard"}
                </div>
                <div className="chat-bubble-text">{turn.text}</div>
              </div>
            ))}
          </div>

          <div className="editor-composer">
            <div className="editor-composer-inner">
              <textarea
                className="editor-composer-textarea"
                placeholder="Ask Shipyard to build something..."
                rows={1}
              />
              <button
                className="editor-composer-send"
                aria-label="Send message"
              >
                <SendIcon />
              </button>
            </div>
            <div className="editor-composer-meta">
              <span className="editor-composer-meta-label">
                Ultimate mode: off
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div
          className="editor-divider"
          data-dragging={isDragging}
          onMouseDown={handleDividerMouseDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panels"
        />

        {/* Right pane — workspace */}
        <div className="editor-right" style={{ flex: 1 }}>
          <div className="editor-workspace-tabs" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className="editor-workspace-tab"
                data-active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                aria-selected={activeTab === tab.id}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="editor-workspace-content" role="tabpanel">
            {tabContent}
          </div>
        </div>
      </div>
    </div>
  );
}
