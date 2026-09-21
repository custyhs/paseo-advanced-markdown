type ViewerPathNode = {
  type: string;
  index?: number;
  tokenIndex?: number;
};

/** Renderer parents run from nearest ancestor to root; React keys are not viewer identity. */
export function viewerIdentity(
  kind: "formula" | "diagram",
  node: ViewerPathNode,
  parents: readonly ViewerPathNode[],
  source: string,
): string {
  const path = [...parents].reverse().concat(node);
  return JSON.stringify([
    kind,
    path.map(({ type, index, tokenIndex }) => [type, index ?? null, tokenIndex ?? null]),
    source,
  ]);
}
