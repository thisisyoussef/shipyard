export const coordinatorAgent = {
  name: "coordinator",
  canWrite: true,
  responsibilities: [
    "Own the task plan",
    "Own every write operation",
    "Merge read-only subagent findings into a single execution path",
  ],
};
