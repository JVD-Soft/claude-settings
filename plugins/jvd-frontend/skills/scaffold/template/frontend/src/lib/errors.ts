/**
 * A chunk that 404s after a deploy — the tab was open across a release and the
 * hashed file it asks for no longer exists. Retrying the render cannot fix
 * that; only a reload can, which is why the error boundary treats it apart.
 */
export const isStaleChunkError = (error: Error): boolean =>
  /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i.test(
    error.message,
  );
