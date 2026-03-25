import { useEffect, useState, type FormEvent } from "react";

import { MicroLabel } from "./primitives.js";

interface TargetCreationDialogProps {
  open: boolean;
  onClose: () => void;
  onCreateTarget: (input: {
    name: string;
    description: string;
    scaffoldType: "react-ts" | "express-ts" | "python" | "go" | "empty";
  }) => void;
}

const DEFAULT_SCAFFOLD_TYPE = "react-ts";

export function TargetCreationDialog(props: TargetCreationDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scaffoldType, setScaffoldType] = useState<
    "react-ts" | "express-ts" | "python" | "go" | "empty"
  >(DEFAULT_SCAFFOLD_TYPE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) {
      setName("");
      setDescription("");
      setScaffoldType(DEFAULT_SCAFFOLD_TYPE);
      setError(null);
    }
  }, [props.open]);

  if (!props.open) {
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!name.trim() || !description.trim()) {
      setError("Name and description are both required.");
      return;
    }

    props.onCreateTarget({
      name: name.trim(),
      description: description.trim(),
      scaffoldType,
    });
  }

  return (
    <div className="target-overlay" role="presentation" onClick={props.onClose}>
      <section
        className="target-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Create a new target"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="target-switcher-header">
          <div>
            <MicroLabel>New Target</MicroLabel>
            <h2>Scaffold a fresh project directory</h2>
          </div>
          <button
            type="button"
            className="target-close"
            onClick={props.onClose}
            aria-label="Close new target dialog"
          >
            Close
          </button>
        </div>

        <form className="target-dialog-form" onSubmit={handleSubmit}>
          <label className="target-field">
            <span>Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder="alpha app"
            />
          </label>

          <label className="target-field">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
              placeholder="Describe the product or prototype you want Shipyard to scaffold."
            />
          </label>

          <label className="target-field">
            <span>Scaffold type</span>
            <select
              value={scaffoldType}
              onChange={(event) =>
                setScaffoldType(
                  event.currentTarget.value as
                    | "react-ts"
                    | "express-ts"
                    | "python"
                    | "go"
                    | "empty",
                )}
            >
              <option value="react-ts">React + TypeScript</option>
              <option value="express-ts">Express + TypeScript</option>
              <option value="python">Python</option>
              <option value="go">Go</option>
              <option value="empty">Empty</option>
            </select>
          </label>

          {error ? <p className="target-form-error">{error}</p> : null}

          <div className="target-dialog-actions">
            <button
              type="button"
              className="target-inline-action"
              onClick={props.onClose}
            >
              Cancel
            </button>
            <button type="submit" className="target-primary-action">
              Create target
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
