import { describe, expect, it } from "vitest";

import {
  createInitialBoardPreferences,
  getBoardSelectedStory,
  readBoardPreferences,
  setBoardSelectedStory,
  writeBoardPreferences,
  type BoardPreferences,
} from "../ui/src/board-preferences.js";

function createStorageStub(initialValue?: BoardPreferences | unknown) {
  const store = new Map<string, string>();

  if (initialValue !== undefined) {
    store.set(
      "shipyard:board-preferences",
      JSON.stringify(initialValue),
    );
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

describe("board preferences", () => {
  it("restores and persists the selected story filter per board scope", () => {
    const storage = createStorageStub();
    let preferences = readBoardPreferences(storage);

    expect(preferences).toEqual(createInitialBoardPreferences());
    expect(getBoardSelectedStory(preferences, "/tmp/alpha-app")).toBe("all");

    preferences = setBoardSelectedStory(
      preferences,
      "/tmp/alpha-app",
      "STORY-UI-001",
    );
    writeBoardPreferences(preferences, storage);

    expect(readBoardPreferences(storage)).toEqual(preferences);
    expect(getBoardSelectedStory(preferences, "/tmp/alpha-app")).toBe(
      "STORY-UI-001",
    );
    expect(getBoardSelectedStory(preferences, "/tmp/beta-app")).toBe("all");
  });

  it("sanitizes malformed persisted board preferences", () => {
    const storage = createStorageStub({
      scopes: {
        "   ": {
          selectedStoryId: "STORY-IGNORED",
        },
        "/tmp/alpha-app": {
          selectedStoryId: 42 as unknown as string,
        },
      },
    });

    expect(readBoardPreferences(storage)).toEqual(createInitialBoardPreferences());
  });
});
