'use client';

import React, { useMemo, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import type { CarBrand } from './constants';

type CarWheelProps = {
  brands: CarBrand[];
  currentBets: Record<string, number>;
  winningBrand: CarBrand | null;
  isSpinning: boolean;
  lite: boolean;
  roundBetting: boolean;
  onBet: (brandId: string) => void;
  wheelRef: RefObject<HTMLDivElement | null>;
  brandRefs: RefObject<Record<string, HTMLButtonElement | null>>;
};

function CarWheelInner({
  brands,
  currentBets,
  winningBrand,
  isSpinning,
  lite,
  roundBetting,
  onBet,
  wheelRef,
  brandRefs,
}: CarWheelProps) {
  const segments = useMemo(
    () =>
      brands.map((brand, i) => ({
        brand,
        angle: i * 36,
        bet: currentBets[brand.id] || 0,
        isWinner: winningBrand?.id === brand.id,
      })),
    [brands, currentBets, winningBrand],
  );

  return (
    <div className="relative w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center">
      {!lite && <div className="absolute inset-[-20px] rounded-full bg-accent/5 blur-3xl" />}

      <div
        className={`absolute inset-[-10px] rounded-full border-[10px] border-[#15151a] z-0 ${
          lite ? '' : 'shadow-[inset_0_0_20px_rgba(0,0,0,0.8),0_10px_40px_rgba(0,0,0,0.5)]'
        }`}
      />

      {!lite && (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-[2px] rounded-full border border-dashed border-white/10 z-0"
        />
      )}

      <div
        ref={wheelRef}
        className="w-full h-full rounded-full relative overflow-hidden border-2 border-white/10 bg-[#08080a] z-10 will-change-transform"
        style={{
          backgroundImage:
            'conic-gradient(from 0deg, #111 0deg, #1a1a1e 18deg, #111 36deg, #1a1a1e 54deg, #111 72deg, #1a1a1e 90deg, #111 108deg, #1a1a1e 126deg, #111 144deg, #1a1a1e 162deg, #111 180deg, #1a1a1e 198deg, #111 216deg, #1a1a1e 234deg, #111 252deg, #1a1a1e 270deg, #111 288deg, #1a1a1e 306deg, #111 324deg, #1a1a1e 342deg, #111 360deg)',
          transform: 'translateZ(0)',
        }}
      >
        {segments.map(({ brand, angle, bet, isWinner }) => (
          <div
            key={brand.id}
            className="absolute top-0 left-1/2 h-1/2 origin-bottom flex flex-col items-center pt-3"
            style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
          >
            <button
              ref={(el) => {
                brandRefs.current[brand.id] = el;
              }}
              onClick={() => onBet(brand.id)}
              disabled={isSpinning || !roundBetting}
              className={`relative w-14 h-14 flex items-center justify-center rounded-2xl transition-transform active:scale-90 ${
                bet && !isSpinning ? 'bg-accent/25 border-2 border-accent scale-110' : ''
              } ${isWinner ? 'ring-4 ring-yellow-500' : ''}`}
            >
              <div
                className={`w-9 h-9 flex items-center justify-center transition-all ${
                  brand.id === 'jaguar'
                    ? 'bg-white rounded-full overflow-hidden p-0.5'
                    : ['bentley', 'ferrari'].includes(brand.id)
                      ? 'bg-white rounded-full p-1'
                      : ''
                } ${bet || isWinner ? 'opacity-100' : 'opacity-60'}`}
              >
                <img src={brand.logo} alt={brand.name} className="w-full h-full object-cover" />
              </div>

              {bet > 0 && !isSpinning && (
                <div className="absolute -top-2 -right-2 bg-accent text-[7px] font-black px-2 py-0.5 rounded-lg shadow-[0_0_10px_rgba(157,80,187,0.5)] border border-white/30 z-50">
                  {bet >= 1000 ? `${bet / 1000}K` : bet}
                </div>
              )}
            </button>
            <span
              className={`text-[6px] mt-1 font-black tracking-widest uppercase ${
                isWinner ? 'text-yellow-500' : 'text-white'
              }`}
            >
              x{brand.multiplier}
            </span>
          </div>
        ))}
      </div>

      <div className="absolute inset-[32%] rounded-full bg-[#0a0a0f] z-20 flex flex-col items-center justify-center border-4 border-[#15151a] shadow-[0_0_30px_rgba(0,0,0,0.8)]">
        <AnimatePresence mode="wait">
          {winningBrand ? (
            <motion.div
              key="winner"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center"
            >
              <div className="w-12 h-12 mb-1 relative">
                <img
                  src={winningBrand.logo}
                  alt={winningBrand.name}
                  className="w-full h-full object-contain z-10 relative"
                />
                {!lite && (
                  <div className="absolute inset-[-10px] bg-yellow-500/20 blur-xl rounded-full animate-pulse" />
                )}
              </div>
              <span className="text-[8px] font-black text-yellow-500 uppercase tracking-widest">
                Victory
              </span>
            </motion.div>
          ) : lite ? (
            <div key="waiting" className="relative">
              <Zap size={32} className="text-accent fill-accent/20" />
            </div>
          ) : (
            <motion.div
              key="waiting"
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
              className="relative"
            >
              <Zap size={32} className="text-accent fill-accent/20 blur-[1px]" />
              <div className="absolute inset-0 bg-accent/30 blur-xl rounded-full" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="absolute top-[-12px] left-1/2 -translate-x-1/2 z-30">
        <div className="w-6 h-8 bg-accent relative flex items-center justify-center clip-path-triangle shadow-[0_0_20px_rgba(157,80,187,0.8)]">
          <div className="w-0.5 h-4 bg-white/40 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export const CarWheel = React.memo(CarWheelInner);
