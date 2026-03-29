import { describe, expect, it } from "vitest";

import {
  createInitialEditorPreferences,
  getEditorPreference,
  readEditorPreferences,
  setEditorActiveTab,
  setEditorSplitRatio,
  writeEditorPreferences,
  type EditorPreferences,
} from "../ui/src/editor-preferences.js";

function createStorageStub(initialValue?: EditorPreferences) {
  const store = new Map<string, string>();

  if (initialValue) {
    store.set("shipyard:editor-preferences", JSON.stringify(initialValue));
  }

  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("editor preferences", () => {
  it("persists tab and split ratio independently per editor scope", () => {
    const storage = createStorageStub();
    let preferences = readEditorPreferences(storage);

    preferences = setEditorActiveTab(
      preferences,
      "/tmp/alpha-app",
      "files",
    );
    preferences = setEditorSplitRatio(preferences, "/tmp/alpha-app", 62);
    preferences = setEditorActiveTab(
      preferences,
      "/tmp/beta-app",
      "code",
    );

    writeEditorPreferences(preferences, storage);

    const restored = readEditorPreferences(storage);

    expect(getEditorPreference(restored, "/tmp/alpha-app")).toEqual({
      activeTab: "files",
      splitRatio: 62,
    });
    expect(getEditorPreference(restored, "/tmp/beta-app")).toEqual({
      activeTab: "code",
      splitRatio: 40,
    });
    expect(getEditorPreference(restored, "/tmp/gamma-app")).toEqual({
      activeTab: "preview",
      splitRatio: 40,
    });
  });

  it("sanitizes stored payloads and clamps invalid split ratios", () => {
    const storage = {
      getItem() {
        return JSON.stringify({
          scopes: {
            "/tmp/alpha-app": {
              activeTab: "bogus",
              splitRatio: 120,
            },
            "/tmp/beta-app": {
              activeTab: "files",
              splitRatio: -1,
            },
          },
        });
      },
    };

    const restored = readEditorPreferences(storage);

    expect(getEditorPreference(restored, "/tmp/alpha-app")).toEqual({
      activeTab: "preview",
      splitRatio: 80,
    });
    expect(getEditorPreference(restored, "/tmp/beta-app")).toEqual({
      activeTab: "files",
      splitRatio: 20,
    });
    expect(createInitialEditorPreferences()).toEqual({
      scopes: {},
    });
  });
});
