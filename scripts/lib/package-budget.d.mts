export declare function checkPackageSourceBudget(
  files: ReadonlyArray<{ path: string; size: number }>,
): {
  sourceFiles: number;
  sourceBytes: number;
  largestSource: { path: string; size: number } | null;
};
