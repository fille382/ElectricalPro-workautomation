/**
 * Compute a SHA-256 hash of an image Blob for duplicate detection.
 * Uses the Web Crypto API (available in all modern browsers).
 * Returns undefined if hashing fails (e.g. no crypto.subtle).
 */
export async function computeImageHash(blob: Blob): Promise<string | undefined> {
  try {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.warn('[ImageHash] Failed to compute hash:', err);
    return undefined;
  }
}
