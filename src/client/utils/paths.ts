/**
 * Convert an absolute path to a relative path if it's within the working directory.
 * Returns the original path if it's outside the working directory or if workingDir is not provided.
 */
export function toRelativePath(absolutePath: string, workingDir?: string): string {
  if (!workingDir || !absolutePath) {
    return absolutePath;
  }

  // Normalize paths (remove trailing slashes)
  const normalizedWorkingDir = workingDir.replace(/\/+$/, '');
  const normalizedPath = absolutePath.replace(/\/+$/, '');

  // Check if the path starts with the working directory
  if (normalizedPath.startsWith(`${normalizedWorkingDir  }/`)) {
    return normalizedPath.slice(normalizedWorkingDir.length + 1);
  }

  // Path is the working directory itself
  if (normalizedPath === normalizedWorkingDir) {
    return '.';
  }

  // Path is outside the working directory, return as-is
  return absolutePath;
}
