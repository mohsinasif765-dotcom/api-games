import type { Viewport } from 'next';
import type { ReactNode } from 'react';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function GameViewportLayout({ children }: { children: ReactNode }) {
  return children;
}
