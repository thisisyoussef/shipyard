export const verifierAgent = {
  name: "verifier",
  canWrite: false,
  responsibilities: [
    "Run lint, tests, and targeted checks",
    "Return structured verification reports",
    "Flag regressions before the coordinator writes again",
  ],
};
