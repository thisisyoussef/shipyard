import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  CodeBrowserErrorResponse,
  CodeBrowserReadResponse,
  CodeBrowserTreeNode,
  CodeBrowserTreeResponse,
} from "../../../src/ui/contracts.js";
import {
  CodeBrowserClientError,
  defaultCodeBrowserClient,
  type CodeBrowserClient,
} from "../code-browser-client.js";
import { Badge } from "../primitives.js";

export interface CodeExplorerPanelProps {
  projectId: string | null;
  codeBrowserClient?: CodeBrowserClient;
}

interface TreeState {
  status: "idle" | "loading" | "ready" | "error";
  data: CodeBrowserTreeResponse | null;
  error: string | null;
}

interface FileState {
  status: "idle" | "loading" | "ready" | "error";
  data: CodeBrowserReadResponse | null;
  error: string | null;
  code: CodeBrowserErrorResponse["code"];
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
      <path d="M14 2v6h6" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className="code-tree-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      style={{
        transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform var(--duration-fast) var(--ease-out)",
      }}
    >
      <polyline points="9,18 15,12 9,6" />
    </svg>
  );
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${String(sizeBytes)} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function collectExpandedDirectories(
  nodes: CodeBrowserTreeNode[],
  expanded = new Set<string>(),
): Set<string> {
  for (const node of nodes) {
    if (node.type !== "directory") {
      continue;
    }

    expanded.add(node.path);

    if (node.children?.length) {
      collectExpandedDirectories(node.children, expanded);
    }
  }

  return expanded;
}

function treeContainsPath(
  nodes: CodeBrowserTreeNode[],
  filePath: string,
): boolean {
  for (const node of nodes) {
    if (node.path === filePath) {
      return true;
    }

    if (node.children?.length && treeContainsPath(node.children, filePath)) {
      return true;
    }
  }

  return false;
}

function createInitialTreeState(): TreeState {
  return {
    status: "idle",
    data: null,
    error: null,
  };
}

function createInitialFileState(): FileState {
  return {
    status: "idle",
    data: null,
    error: null,
    code: undefined,
  };
}

export function CodeExplorerPanel({
  projectId,
  codeBrowserClient = defaultCodeBrowserClient,
}: CodeExplorerPanelProps) {
  const [treeState, setTreeState] = useState<TreeState>(createInitialTreeState);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [fileState, setFileState] = useState<FileState>(createInitialFileState);
  const treeRequestSequenceRef = useRef(0);
  const fileRequestSequenceRef = useRef(0);

  useEffect(() => {
    if (!projectId) {
      setTreeState(createInitialTreeState());
      setSelectedPath(null);
      setExpandedPaths(new Set());
      return;
    }

    const requestSequence = treeRequestSequenceRef.current + 1;
    treeRequestSequenceRef.current = requestSequence;
    setTreeState({
      status: "loading",
      data: null,
      error: null,
    });
    setSelectedPath(null);
    setExpandedPaths(new Set());
    setFileState(createInitialFileState());

    void codeBrowserClient.loadTree(projectId)
      .then((tree) => {
        if (treeRequestSequenceRef.current !== requestSequence) {
          return;
        }

        setTreeState({
          status: "ready",
          data: tree,
          error: null,
        });
        setExpandedPaths(collectExpandedDirectories(tree.nodes));
      })
      .catch((error: unknown) => {
        if (treeRequestSequenceRef.current !== requestSequence) {
          return;
        }

        setTreeState({
          status: "error",
          data: null,
          error: error instanceof Error
            ? error.message
            : "Shipyard could not load the current target files.",
        });
      });
  }, [codeBrowserClient, projectId]);

  useEffect(() => {
    if (!projectId || !selectedPath) {
      setFileState(createInitialFileState());
      return;
    }

    const requestSequence = fileRequestSequenceRef.current + 1;
    fileRequestSequenceRef.current = requestSequence;
    setFileState({
      status: "loading",
      data: null,
      error: null,
      code: undefined,
    });

    void codeBrowserClient.readFile(projectId, selectedPath)
      .then((file) => {
        if (fileRequestSequenceRef.current !== requestSequence) {
          return;
        }

        setFileState({
          status: "ready",
          data: file,
          error: null,
          code: undefined,
        });
      })
      .catch((error: unknown) => {
        if (fileRequestSequenceRef.current !== requestSequence) {
          return;
        }

        setFileState({
          status: "error",
          data: null,
          error: error instanceof Error
            ? error.message
            : "Shipyard could not read the selected file.",
          code: error instanceof CodeBrowserClientError ? error.code : undefined,
        });
      });
  }, [codeBrowserClient, projectId, selectedPath]);

  useEffect(() => {
    if (
      !selectedPath ||
      treeState.status !== "ready" ||
      !treeState.data ||
      treeContainsPath(treeState.data.nodes, selectedPath)
    ) {
      return;
    }

    setSelectedPath(null);
  }, [selectedPath, treeState]);

  const toggleDirectory = useCallback((directoryPath: string) => {
    setExpandedPaths((currentExpandedPaths) => {
      const nextExpandedPaths = new Set(currentExpandedPaths);

      if (nextExpandedPaths.has(directoryPath)) {
        nextExpandedPaths.delete(directoryPath);
      } else {
        nextExpandedPaths.add(directoryPath);
      }

      return nextExpandedPaths;
    });
  }, []);

  const renderTreeNodes = useCallback((
    nodes: CodeBrowserTreeNode[],
    depth = 0,
  ): ReactNode => {
    return nodes.map((node) => {
      const expanded = node.type === "directory"
        ? expandedPaths.has(node.path)
        : false;
      const isSelected = node.type === "file" && selectedPath === node.path;

      return (
        <div key={node.path}>
          <button
            type="button"
            className="code-tree-item"
            data-selected={isSelected}
            data-type={node.type}
            role="treeitem"
            aria-level={depth + 1}
            aria-expanded={node.type === "directory" ? expanded : undefined}
            aria-selected={node.type === "file" ? isSelected : undefined}
            style={{
              paddingLeft: `calc(var(--space-3) + ${String(depth * 16)}px)`,
            }}
            onClick={() => {
              if (node.type === "directory") {
                toggleDirectory(node.path);
                return;
              }

              setSelectedPath(node.path);
            }}
          >
            {node.type === "directory" ? <ChevronIcon expanded={expanded} /> : (
              <span className="code-tree-indent" aria-hidden="true" />
            )}
            {node.type === "directory" ? <FolderIcon /> : <FileIcon />}
            <span>{node.name}</span>
          </button>

          {node.type === "directory" && expanded && node.children?.length ? (
            <div role="group">{renderTreeNodes(node.children, depth + 1)}</div>
          ) : null}
        </div>
      );
    });
  }, [expandedPaths, selectedPath, toggleDirectory]);

  function renderTreeBody(): ReactNode {
    if (!projectId) {
      return (
        <div className="code-tree-empty">
          <p>Code browser unavailable until a target is active.</p>
        </div>
      );
    }

    if (treeState.status === "loading") {
      return (
        <div className="code-tree-empty">
          <p>Loading the current target file tree…</p>
        </div>
      );
    }

    if (treeState.status === "error") {
      return (
        <div className="code-tree-empty" data-tone="danger">
          <p>{treeState.error}</p>
        </div>
      );
    }

    if (!treeState.data || treeState.data.nodes.length === 0) {
      return (
        <div className="code-tree-empty">
          <p>No visible files were found in this target yet.</p>
        </div>
      );
    }

    return (
      <div role="tree" aria-label="Project files">
        {renderTreeNodes(treeState.data.nodes)}
      </div>
    );
  }

  function renderCodeViewer(): ReactNode {
    if (!projectId) {
      return (
        <div className="code-viewer-empty">
          <p>Choose or create a target to inspect real files.</p>
        </div>
      );
    }

    if (!selectedPath) {
      return (
        <div className="code-viewer-empty">
          <p>Select a file to inspect its contents. Shipyard only reads inside the active target.</p>
        </div>
      );
    }

    if (fileState.status === "loading") {
      return (
        <div className="code-viewer-empty">
          <p>Reading {selectedPath}…</p>
        </div>
      );
    }

    if (fileState.status === "error") {
      return (
        <div className="code-viewer-empty" data-tone="danger">
          <p>{fileState.error}</p>
          {fileState.code === "access_denied" ? (
            <p>Shipyard keeps the browser locked to the active target root.</p>
          ) : null}
        </div>
      );
    }

    if (!fileState.data) {
      return (
        <div className="code-viewer-empty">
          <p>Shipyard is ready to load a file from the tree.</p>
        </div>
      );
    }

    return (
      <>
        <div className="code-viewer-header">
          <span>{fileState.data.path}</span>
          <Badge tone="neutral">{formatFileSize(fileState.data.sizeBytes)}</Badge>
          {fileState.data.binary ? <Badge tone="warning">Binary</Badge> : null}
          {fileState.data.truncated ? <Badge tone="accent">Truncated</Badge> : null}
        </div>

        {fileState.data.binary ? (
          <div className="code-viewer-empty">
            <p>This file is binary, so Shipyard will not render it inline.</p>
          </div>
        ) : (
          <div className="code-viewer-content">
            {fileState.data.truncated ? (
              <p className="code-viewer-note">
                Large file preview limited to keep the editor responsive.
              </p>
            ) : null}
            <pre>{fileState.data.contents ?? ""}</pre>
          </div>
        )}
      </>
    );
  }

  return (
    <section className="code-tab-split" aria-label="Code explorer">
      <div className="code-tree">
        <div className="code-tree-header">
          <div className="code-tree-copy">
            <p className="panel-kicker">Code</p>
            <h2 className="panel-title">Read-only explorer</h2>
          </div>
          {treeState.data ? (
            <code className="code-tree-root">{treeState.data.root.name}</code>
          ) : null}
        </div>
        {renderTreeBody()}
      </div>

      <div className="code-viewer">{renderCodeViewer()}</div>
    </section>
  );
}
