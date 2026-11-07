'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Coins, Trophy } from 'lucide-react';
import type { WinnerInfo } from './constants';
import { surfaceClass } from './constants';

type CarWinnerBannerProps = {
  winnerInfo: WinnerInfo | null;
  lite: boolean;
};

function CarWinnerBannerInner({ winnerInfo, lite }: CarWinnerBannerProps) {
  return (
    <AnimatePresence>
      {winnerInfo && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-[340px] inset-x-0 z-[100] flex justify-center px-5"
        >
          <div
            className={`w-full max-w-md border-yellow-500/30 p-4 rounded-3xl flex items-center gap-4 shadow-2xl relative overflow-hidden ${surfaceClass(lite, 'card')}`}
          >
            <motion.div
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 6, ease: 'linear' }}
              className="absolute bottom-0 left-0 h-1 bg-yellow-500/50"
            />

            <div className="relative w-12 h-12 shrink-0">
              {!lite && (
                <div className="absolute inset-0 bg-yellow-500/20 blur-md rounded-full animate-pulse" />
              )}
              <img
                src={winnerInfo.avatar}
                alt={winnerInfo.name}
                className="w-full h-full object-cover rounded-full border-2 border-yellow-500/50 relative z-10"
              />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-black border border-white/10 rounded-full flex items-center justify-center z-20">
                <Trophy size={10} className="text-yellow-500" />
              </div>
            </div>

            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-yellow-500 font-black uppercase tracking-widest">
                  {winnerInfo.isUserWin ? 'Big Winner' : 'Round Result'}
                </span>
                <div className="h-2 w-[1px] bg-white/10" />
                <span className="text-[10px] text-white/40 uppercase font-bold truncate">
                  {winnerInfo.brand?.name} result
                </span>
              </div>
              <h3 className="text-sm font-black text-white truncate italic tracking-tight">
                {winnerInfo.name}{' '}
                {winnerInfo.isUserWin ? (
                  <span className="text-yellow-500 text-[10px] not-italic ml-1">WON</span>
                ) : (
                  <span className="text-white/40 text-[10px] not-italic ml-1">SELECTED</span>
                )}
              </h3>
              {winnerInfo.isUserWin && (
                <div className="flex items-center gap-1">
                  <Coins size={12} className="text-yellow-500" />
                  <span className="text-lg font-black text-yellow-500 leading-none">
                    +{winnerInfo.amount.toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            <div
              className={`w-16 h-16 rounded-2xl border-white/10 p-2 flex items-center justify-center shadow-inner group relative overflow-hidden ${
                lite ? 'bg-black/80 border' : 'glass-dark'
              }`}
            >
              <img
                src={winnerInfo.brand?.logo}
                alt="winner"
                className="w-full h-full object-contain relative z-10"
              />
              {!lite && (
                <div className="absolute inset-0 bg-accent/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const CarWinnerBanner = React.memo(CarWinnerBannerInner);
