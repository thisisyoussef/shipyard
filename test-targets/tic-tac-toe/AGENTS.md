# Tic-Tac-Toe Test Target Rules

This repository is a dedicated Shipyard test target. It should stay small,
easy to reset, and focused on a browser-based tic-tac-toe game.

## Goal

Build a simple tic-tac-toe game that can be run locally in a browser.

## Defaults

- Prefer React + TypeScript + Vite unless the operator asks for something else.
- Keep the dependency surface light.
- Favor small files and straightforward state management over abstraction.
- Add tests when they materially improve confidence for the requested change.

## Working Notes

- Start from the current files in this target instead of assuming hidden setup.
- If `package.json` exists, use its scripts as the source of truth.
- Keep runtime artifacts under `.shipyard/` and build artifacts out of version control.
