"use client";

import React from "react";
import { formatChip } from "@/lib/teenPatti/constants";

const CHIP_COLORS: Record<number, { edge: string; face: string; text: string }> = {
  200: { edge: "#8B4513", face: "#CD853F", text: "#fff" },
  1000: { edge: "#1565C0", face: "#42A5F5", text: "#fff" },
  5000: { edge: "#6A1B9A", face: "#AB47BC", text: "#fff" },
  10000: { edge: "#2E7D32", face: "#66BB6A", text: "#fff" },
  50000: { edge: "#C62828", face: "#EF5350", text: "#fff" },
  100000: { edge: "#E65100", face: "#FFA726", text: "#1a0a3e" },
};

type CoinChipProps = {
  amount: number;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function CoinChip({ amount, selected, disabled, onClick }: CoinChipProps) {
  const colors = CHIP_COLORS[amount] ?? CHIP_COLORS[200];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative shrink-0 transition-transform duration-150 ${
        disabled ? "opacity-45 pointer-events-none" : "active:scale-90"
      } ${selected ? "scale-110 -translate-y-1 z-10" : "scale-100"}`}
      style={{ width: 46, height: 46 }}
    >
      {selected && (
        <span className="absolute -inset-1 rounded-full bg-yellow-300/40 blur-sm animate-pulse" />
      )}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: `linear-gradient(145deg, ${colors.edge}, #1a1a1a 55%, ${colors.edge})`,
          boxShadow: selected
            ? "0 4px 14px rgba(255,213,79,0.55), inset 0 2px 4px rgba(255,255,255,0.25)"
            : "0 3px 8px rgba(0,0,0,0.45), inset 0 1px 2px rgba(255,255,255,0.2)",
        }}
      />
      <span
        className="absolute rounded-full border-2 border-dashed border-white/25"
        style={{ inset: 4 }}
      />
      <span
        className="absolute rounded-full flex items-center justify-center font-black text-[9px] leading-none tracking-tight"
        style={{
          inset: 7,
          background: `radial-gradient(circle at 35% 30%, ${colors.face}, ${colors.edge})`,
          color: colors.text,
          boxShadow: "inset 0 2px 6px rgba(255,255,255,0.35), inset 0 -2px 4px rgba(0,0,0,0.25)",
        }}
      >
        {formatChip(amount)}
      </span>
      <span
        className="absolute top-1 left-2 w-3 h-1.5 rounded-full bg-white/30 rotate-[-25deg]"
        aria-hidden
      />
    </button>
  );
}
