export interface GraphNode<State> {
  name: string;
  run: (state: State) => Promise<State> | State;
}

export interface GraphRunner<State> {
  run: (initialState: State) => Promise<State>;
}

export function createLinearGraph<State>(
  nodes: GraphNode<State>[],
): GraphRunner<State> {
  return {
    async run(initialState: State): Promise<State> {
      let state = initialState;

      for (const node of nodes) {
        state = await node.run(state);
      }

      return state;
    },
  };
}
