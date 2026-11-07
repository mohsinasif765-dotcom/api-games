'use client';

import React from 'react';
import { CHIP_VALUES } from './constants';

type CarBetFooterProps = {
  selectedChip: number;
  onSelectChip: (value: number) => void;
  lite: boolean;
};

const CHIP_SIZES = ['w-12 h-12', 'w-14 h-14', 'w-16 h-16', 'w-[72px] h-[72px]'] as const;
const CHIP_TEXT = ['text-[9px]', 'text-[10px]', 'text-xs', 'text-sm'] as const;

function chipColors(val: number) {
  if (val === 200) return { from: '#3b82f6', to: '#1e3a8a', shadow: '#3b82f6' };
  if (val === 1000) return { from: '#10b981', to: '#064e3b', shadow: '#10b981' };
  if (val === 10000) return { from: '#f59e0b', to: '#78350f', shadow: '#f59e0b' };
  return { from: '#ef4444', to: '#7f1d1d', shadow: '#ef4444' };
}

function CarBetFooterInner({ selectedChip, onSelectChip, lite }: CarBetFooterProps) {
  return (
    <footer className="w-full max-w-md bg-[#0a0a0f] rounded-t-[32px] px-4 pt-5 pb-6 border-t border-white/5 shadow-[0_-20px_40px_rgba(0,0,0,0.5)] z-40 relative">
      <div className="flex items-end justify-between gap-1 mb-4 px-1">
        {CHIP_VALUES.map((val, index) => {
          const colors = chipColors(val);
          return (
            <button
              key={val}
              onClick={() => onSelectChip(val)}
              className={`relative ${CHIP_SIZES[index]} rounded-full flex items-center justify-center transition-transform active:scale-90 ${
                selectedChip === val ? 'scale-110 z-10' : 'opacity-60 grayscale-[0.3]'
              }`}
              style={{
                background: `radial-gradient(circle at 30% 30%, ${colors.from}, ${colors.to})`,
                boxShadow: lite
                  ? '0 2px 0 rgba(0,0,0,0.35)'
                  : `
                          0 4px 0 rgba(0,0,0,0.4),
                          0 10px 20px rgba(0,0,0,0.5),
                          inset 0 2px 5px rgba(255,255,255,0.3),
                          ${selectedChip === val ? `0 0 25px ${colors.shadow}80` : 'none'}
                        `,
                border: '2px solid rgba(255,255,255,0.1)',
              }}
            >
              {!lite && <div className="absolute inset-1 rounded-full border border-dashed border-white/20" />}
              {!lite && <div className="absolute inset-[3px] rounded-full border-2 border-black/20" />}

              <div className="relative flex flex-col items-center">
                <span
                  className={`${CHIP_TEXT[index]} font-black italic tracking-tighter text-white drop-shadow-md`}
                >
                  {val >= 1000 ? `${val / 1000}K` : val}
                </span>
                <div className="w-4 h-0.5 bg-white/20 rounded-full mt-0.5" />
              </div>

              {selectedChip === val && !lite && (
                <div className="absolute -inset-1 rounded-full border-2 border-white/50" />
              )}
            </button>
          );
        })}
      </div>
    </footer>
  );
}

export const CarBetFooter = React.memo(CarBetFooterInner);
