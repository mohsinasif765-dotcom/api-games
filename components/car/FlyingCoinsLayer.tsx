'use client';

import React from 'react';
import { motion } from 'framer-motion';
import type { FlyingCoin } from './constants';

type FlyingCoinsLayerProps = {
  coins: FlyingCoin[];
  lite: boolean;
  onDone: (id: number) => void;
};

function coinGradient(value: number): string {
  if (value === 200) return 'radial-gradient(circle, #3b82f6, #1e3a8a)';
  if (value === 1000) return 'radial-gradient(circle, #10b981, #064e3b)';
  if (value === 10000) return 'radial-gradient(circle, #f59e0b, #78350f)';
  return 'radial-gradient(circle, #ef4444, #7f1d1d)';
}

function FlyingCoinsLayerInner({ coins, lite, onDone }: FlyingCoinsLayerProps) {
  return (
    <div className="fixed inset-0 pointer-events-none z-[200]">
      {coins.map((coin) => (
        <motion.div
          key={coin.id}
          initial={{ x: coin.x, y: coin.y, scale: 1, opacity: 1 }}
          animate={{
            x: coin.tx,
            y: coin.ty,
            scale: 0.5,
            opacity: 0.8,
          }}
          transition={{ duration: lite ? 0.35 : 0.6, ease: 'circOut' }}
          onAnimationComplete={() => onDone(coin.id)}
          className="absolute w-8 h-8 rounded-full flex items-center justify-center border border-white/20 will-change-transform"
          style={{
            background: coinGradient(coin.value),
            boxShadow: lite ? 'none' : '0 0 15px rgba(0,0,0,0.5)',
            transform: 'translateZ(0)',
          }}
        >
          <span className="text-[6px] font-black text-white">
            {coin.value >= 1000 ? `${coin.value / 1000}K` : coin.value}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

export const FlyingCoinsLayer = React.memo(FlyingCoinsLayerInner);
