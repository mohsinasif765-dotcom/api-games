import type { Metadata } from 'next';
import { WarmupRunner } from './WarmupRunner';

export const metadata: Metadata = {
  title: 'warmup',
  robots: { index: false, follow: false },
};

/**
 * Loaded by the host app in a hidden WebView at startup to pre-cache game
 * files. See docs/flutter-warmup.md.
 */
export default function WarmupPage() {
  return <WarmupRunner />;
}
