/**
 * Preload + decode images, reporting progress (0–100).
 *
 * Resolves when every image has loaded *or failed* (a missing image must
 * never block the splash) and never rejects.
 */
export function preloadImages(
  urls: readonly string[],
  onProgress?: (pct: number) => void,
): Promise<void> {
  const unique = Array.from(new Set(urls));
  if (unique.length === 0) {
    onProgress?.(100);
    return Promise.resolve();
  }
  let done = 0;
  const tick = () => {
    done += 1;
    onProgress?.(Math.round((done / unique.length) * 100));
  };
  return Promise.all(
    unique.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.decoding = 'async';
          const finish = () => {
            tick();
            resolve();
          };
          img.onload = () => {
            // Decode off the main thread so the first frame after the splash
            // doesn't jank on large images.
            (img.decode?.() ?? Promise.resolve()).then(finish, finish);
          };
          img.onerror = finish;
          img.src = url;
        }),
    ),
  ).then(() => undefined);
}
