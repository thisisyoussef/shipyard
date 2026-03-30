import { describe, expect, it } from "vitest";

import { formatEnvFile, parseEnvFile } from "../src/mission-control/env.js";

describe("mission control env helpers", () => {
  it("parses shell-style env files with comments and exports", () => {
    const env = parseEnvFile(`
# Comment
export OPENAI_API_KEY=sk-live
LANGCHAIN_PROJECT="shipyard mission"
UNQUOTED=value # trailing comment
IGNORED LINE
    `);

    expect(env).toEqual({
      OPENAI_API_KEY: "sk-live",
      LANGCHAIN_PROJECT: "shipyard mission",
      UNQUOTED: "value",
    });
  });

  it("formats env files into a stable quoted representation", () => {
    expect(
      formatEnvFile({
        BETA: "two",
        ALPHA: "one",
      }),
    ).toBe('ALPHA="one"\nBETA="two"\n');
  });
});
