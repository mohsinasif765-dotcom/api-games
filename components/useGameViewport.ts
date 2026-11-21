'use client';

import { useLayoutEffect, useRef, useState } from 'react';

export function useGameViewport(
  designWidth: number,
  designHeight: number,
  maxScale = Infinity,
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [{ width, height }, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const content = viewportRef.current;
    if (!content) return;

    const measure = () => {
      const { width, height } = content.getBoundingClientRect();
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const scale = width > 0 && height > 0
    ? Math.min(width / designWidth, height / designHeight, maxScale)
    : 1;

  return { viewportRef, scale, width, height };
}
