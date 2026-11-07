'use client';

import { useEffect, useRef } from 'react';
import { applyWebViewAccessToken } from '@/lib/webview-auth';

/**
 * Thin Next.js shell: WebView auth + full-viewport Phaser mount.
 * Ported from SK Live fruit-party-phaser.
 */
export default function FruitPartyPage() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let destroyed = false;
    let game: import('phaser').Game | null = null;
    let controller: { destroy: () => void } | null = null;

    const boot = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      await applyWebViewAccessToken(token);

      if (destroyed || !hostRef.current) return;

      const [{ createFruitPartyGame }, { FruitPartyController }] =
        await Promise.all([
          import('@/lib/fruit-party-phaser/createGame'),
          import('@/lib/fruit-party-phaser/FruitPartyController'),
        ]);

      if (destroyed || !hostRef.current) return;

      const ctrl = new FruitPartyController();
      controller = ctrl;
      await ctrl.start();

      if (destroyed || !hostRef.current) {
        ctrl.destroy();
        return;
      }

      game = createFruitPartyGame({
        parent: hostRef.current,
        controller: ctrl,
      });
    };

    void boot();

    return () => {
      destroyed = true;
      game?.destroy(true);
      game = null;
      controller?.destroy();
      controller = null;
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="fixed inset-0 h-[100dvh] w-full overflow-hidden bg-[#0d0518]"
      style={{ touchAction: 'none' }}
    />
  );
}
