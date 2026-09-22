const MAX_SOURCE_BYTES = 2_000_000;
const MAX_SOURCE_FILES = 200;
const SOURCE_EXTENSION = /\.[cm]?[jt]sx?$/;
const SOURCE_DIRECTORY = /^(?:client|server|shared|scripts)\//;
const ROOT_ENTRY = /^index\.(?:client|server)\.[cm]?[jt]sx?$/;

/**
 * Count the published source superset, including declarations and generated
 * modules that a parser or import traversal might miss. Binary/data assets do
 * not consume this source budget.
 * @param {Array<{path: string, size: number}>} files npm pack --json file entries
 */
export function checkPackageSourceBudget(files) {
  let sourceFiles = 0;
  let sourceBytes = 0;
  /** @type {{path: string, size: number} | null} */
  let largestSource = null;
  for (const file of files) {
    if (
      !SOURCE_EXTENSION.test(file.path) ||
      (!SOURCE_DIRECTORY.test(file.path) && !ROOT_ENTRY.test(file.path))
    )
      continue;
    if (!Number.isSafeInteger(file.size) || file.size < 0)
      throw new Error(`Invalid package source size: ${file.path} (${file.size})`);
    if (file.size > MAX_SOURCE_BYTES)
      throw new Error(
        `Package source file exceeds ${MAX_SOURCE_BYTES} bytes: ${file.path} (${file.size})`,
      );
    sourceFiles += 1;
    sourceBytes += file.size;
    if (!largestSource || file.size > largestSource.size)
      largestSource = { path: file.path, size: file.size };
  }
  if (sourceFiles > MAX_SOURCE_FILES)
    throw new Error(`Package source count exceeds ${MAX_SOURCE_FILES} files: ${sourceFiles}`);
  if (sourceBytes > MAX_SOURCE_BYTES)
    throw new Error(`Package source total exceeds ${MAX_SOURCE_BYTES} bytes: ${sourceBytes}`);
  return { sourceFiles, sourceBytes, largestSource };
}
