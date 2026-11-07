export type CarBrand = {
  id: string;
  name: string;
  multiplier: number;
  color: string;
  logo: string;
};

export type FlyingCoin = {
  id: number;
  brandId: string;
  value: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
};

export type WinnerInfo = {
  name: string;
  amount: number;
  avatar: string;
  brand: CarBrand;
  isUserWin?: boolean;
};

export const CAR_BRANDS: CarBrand[] = [
  { id: 'bugatti', name: 'Bugatti', multiplier: 100, color: '#FF0000', logo: '/bugati.webp' },
  { id: 'bentley', name: 'Bentley', multiplier: 88, color: '#00FF00', logo: '/betly.webp' },
  { id: 'ferrari', name: 'Ferrari', multiplier: 66, color: '#FFFF00', logo: '/ferari.webp' },
  { id: 'lamborghini', name: 'Lamborghini', multiplier: 50, color: '#FFA500', logo: '/lamborgini.webp' },
  { id: 'porsche', name: 'Porsche', multiplier: 30, color: '#0000FF', logo: '/assets/porche.webp' },
  { id: 'landrover', name: 'Land Rover', multiplier: 20, color: '#8B4513', logo: '/landrover.webp' },
  { id: 'jaguar', name: 'Jaguar', multiplier: 18, color: '#808080', logo: '/haguar.webp' },
  { id: 'mercedes', name: 'Mercedes', multiplier: 8, color: '#C0C0C0', logo: '/mercdees.webp' },
  { id: 'vw', name: 'VW', multiplier: 5, color: '#ADD8E6', logo: '/assets/vw.webp' },
  { id: 'bmw', name: 'BMW', multiplier: 2, color: '#FFFFFF', logo: '/bmww.webp' },
];

export const CHIP_VALUES = [200, 1000, 10000, 100000] as const;

/** Solid substitute for glass-* (no backdrop-filter) on mobile WebView. */
export function surfaceClass(lite: boolean, kind: 'card' | 'dark' = 'card'): string {
  if (lite) {
    return kind === 'dark'
      ? 'bg-black/80 border border-white/5'
      : 'bg-black/80 border border-white/10';
  }
  return kind === 'dark' ? 'glass-dark' : 'glass-card';
}
