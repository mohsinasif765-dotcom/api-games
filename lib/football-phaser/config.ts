export type TeamItem = {
  id: string;
  name: string;
  multiplier: number;
  color: string;
  logo: string;
  /** Inner pitch cell art (logo + multiplier baked in). */
  betBox: string;
  textureKey: string;
};

export const TEAMS: TeamItem[] = [
  {
    id: 'man_united',
    name: 'Man United',
    multiplier: 100,
    color: '#FF0000',
    logo: '/football/manchester.webp',
    betBox: '/football/inner_boxes/bet_box_x100.webp',
    textureKey: 'team_man_united',
  },
  {
    id: 'al_nassr',
    name: 'Al Nassr',
    multiplier: 88,
    color: '#FFFF00',
    logo: '/football/Al Nassr.webp',
    betBox: '/football/inner_boxes/bet_box_x88.webp',
    textureKey: 'team_al_nassr',
  },
  {
    id: 'bayern',
    name: 'Bayern Munich',
    multiplier: 66,
    color: '#FF0000',
    logo: '/football/Bayern Munich.webp',
    betBox: '/football/inner_boxes/bet_box_x66.webp',
    textureKey: 'team_bayern',
  },
  {
    id: 'porto',
    name: 'FC Porto',
    multiplier: 50,
    color: '#0000FF',
    logo: '/football/fcp.webp',
    betBox: '/football/inner_boxes/bet_box_x50.webp',
    textureKey: 'team_porto',
  },
  {
    id: 'juventus',
    name: 'Juventus',
    multiplier: 30,
    color: '#FFFFFF',
    logo: '/football/Juventus.jpg',
    betBox: '/football/inner_boxes/bet_box_x30.webp',
    textureKey: 'team_juventus',
  },
  {
    id: 'man_city',
    name: 'Man City',
    multiplier: 20,
    color: '#ADD8E6',
    logo: '/football/Manchester City.webp',
    betBox: '/football/inner_boxes/bet_box_x20.webp',
    textureKey: 'team_man_city',
  },
  {
    id: 'psg',
    name: 'PSG',
    multiplier: 18,
    color: '#000080',
    logo: '/football/Paris Saint-Germain.webp',
    betBox: '/football/inner_boxes/bet_box_x18.webp',
    textureKey: 'team_psg',
  },
  {
    id: 'real_madrid',
    name: 'Real Madrid',
    multiplier: 8,
    color: '#FFFFFF',
    logo: '/football/real.jpg',
    betBox: '/football/inner_boxes/bet_box_x8.webp',
    textureKey: 'team_real_madrid',
  },
  {
    id: 'soccer_club',
    name: 'Soccer Club',
    multiplier: 5,
    color: '#ADD8E6',
    logo: '/football/soccer club.jpg',
    betBox: '/football/inner_boxes/bet_box_x5.webp',
    textureKey: 'team_soccer_club',
  },
  {
    id: 'aldenaire',
    name: 'Aldenaire',
    multiplier: 2,
    color: '#FFFFFF',
    logo: '/football/aldenaire.webp',
    betBox: '/football/inner_boxes/bet_box_x2.webp',
    textureKey: 'team_aldenaire',
  },
];

const RING_DIR = '/football/football_ring_16_icons';

/**
 * 16 outer logos clockwise from 12 o'clock (filenames 01…16).
 * teamId links each icon to a betting section for spin/win highlight.
 */
export type RingIcon = {
  id: string;
  teamId: string;
  src: string;
  name: string;
};

export const RING_ICONS: RingIcon[] = [
  {
    id: 'ring_01',
    teamId: 'man_united',
    src: `${RING_DIR}/01_al_ahly_top.webp`,
    name: 'Al Ahly',
  },
  {
    id: 'ring_02',
    teamId: 'soccer_club',
    src: `${RING_DIR}/02_bayern_top_right.webp`,
    name: 'Bayern',
  },
  {
    id: 'ring_03',
    teamId: 'real_madrid',
    src: `${RING_DIR}/03_manchester_top_right.webp`,
    name: 'Manchester',
  },
  {
    id: 'ring_04',
    teamId: 'psg',
    src: `${RING_DIR}/04_psg_right.webp`,
    name: 'PSG',
  },
  {
    id: 'ring_05',
    teamId: 'porto',
    src: `${RING_DIR}/05_purple_g_right.webp`,
    name: 'Purple G',
  },
  {
    id: 'ring_06',
    teamId: 'juventus',
    src: `${RING_DIR}/06_wadi_degla_right.webp`,
    name: 'Wadi Degla',
  },
  {
    id: 'ring_07',
    teamId: 'man_city',
    src: `${RING_DIR}/07_al_hilal_right.webp`,
    name: 'Al Hilal',
  },
  {
    id: 'ring_08',
    teamId: 'aldenaire',
    src: `${RING_DIR}/08_air_force_bottom_right.webp`,
    name: 'Air Force',
  },
  {
    id: 'ring_09',
    teamId: 'al_nassr',
    src: `${RING_DIR}/09_raja_bottom.webp`,
    name: 'Raja',
  },
  {
    id: 'ring_10',
    teamId: 'aldenaire',
    src: `${RING_DIR}/10_psg_bottom_left.webp`,
    name: 'PSG',
  },
  {
    id: 'ring_11',
    teamId: 'juventus',
    src: `${RING_DIR}/11_wadi_degla_bottom_left.webp`,
    name: 'Wadi Degla',
  },
  {
    id: 'ring_12',
    teamId: 'soccer_club',
    src: `${RING_DIR}/12_air_force_lower_left.webp`,
    name: 'Air Force',
  },
  {
    id: 'ring_13',
    teamId: 'bayern',
    src: `${RING_DIR}/13_orange_eagle_left.webp`,
    name: 'Orange Eagle',
  },
  {
    id: 'ring_14',
    teamId: 'man_city',
    src: `${RING_DIR}/14_al_hilal_left.webp`,
    name: 'Al Hilal',
  },
  {
    id: 'ring_15',
    teamId: 'real_madrid',
    src: `${RING_DIR}/15_manchester_top_left.webp`,
    name: 'Manchester',
  },
  {
    id: 'ring_16',
    teamId: 'bayern',
    src: `${RING_DIR}/16_bayern_top_left.webp`,
    name: 'Bayern',
  },
];

export const EMPTY_GREEN_RING = '/football/green-ring.webp';

/** Full inner hub board (all 10 boxes joined) — sits inside green ring. */
export const INNER_BOARD = '/football/inner_boxes/inner_board_all_boxes.webp';

/** Inner board size as % of wheel stage (fills green-ring hub). */
export const INNER_BOARD_PCT = 70;

/** 16-segment wheel — same order as RING_ICONS (clockwise from top). */
export const WHEEL_SEGMENTS: TeamItem[] = RING_ICONS.map((icon) => {
  const team = TEAMS.find((t) => t.id === icon.teamId);
  if (!team) {
    throw new Error(`Missing team for ring icon ${icon.id}: ${icon.teamId}`);
  }
  return team;
});

/** Logo distance from stage center as % of stage (green ring 88% × band mid). */
export const RING_LOGO_RADIUS_PCT = 37.3;
/** Logo size as % of stage. */
export const RING_LOGO_SIZE_PCT = 7.2;

const COIN_BTN = '/football/football_coin_buttons_transparent_trimmed';

export const CHIPS = [
  {
    amount: 200,
    /** Full tray button (chip + cradle + frame). */
    image: `${COIN_BTN}/coin_button_200.webp`,
    /** Circular face for chips placed on pitch boxes. */
    face: '/euro-roulette/chips/chip_200.webp',
    label: '200',
  },
  {
    amount: 500,
    image: `${COIN_BTN}/coin_button_500.webp`,
    face: '/euro-roulette/chips/chip_500.webp',
    label: '500',
  },
  {
    amount: 1000,
    image: `${COIN_BTN}/coin_button_1000.webp`,
    face: '/euro-roulette/chips/chip_1k.webp',
    label: '1K',
  },
  {
    amount: 5000,
    image: `${COIN_BTN}/coin_button_5000.webp`,
    face: '/euro-roulette/chips/chip_5k.webp',
    label: '5K',
  },
  {
    amount: 30000,
    image: `${COIN_BTN}/coin_button_30000.webp`,
    face: '/fruit-party/chips/chip_50k.webp',
    label: '30K',
  },
] as const;

export type ChipItem = (typeof CHIPS)[number];

/** Highlight order for smoothBoardSpin (16 segments). */
export const SPIN_ORDER = WHEEL_SEGMENTS.map((t) => t.id);

export const GAME_SLUG = 'football_roulette';
export const GAME_NAME = 'Football Roulette';

export const GAME_WIDTH = 400;
export const GAME_HEIGHT = 400;

export const WHEEL = {
  cx: GAME_WIDTH / 2,
  cy: GAME_HEIGHT / 2,
  /** Visual outer bound (green-ring = stage). */
  outerRadius: 192,
  /** Logos sit on the green-ring band (Phaser highlight / spark). */
  logoRadius: 149,
  logoSize: 29,
  /** Hub for bet boxes. */
  hubRadius: 128,
  highlightWidth: 10,
} as const;

/** HTML pitch grid — same size as INNER_BOARD so cells align 1:1. */
export const PITCH_GRID_PCT = 70;

/**
 * Inner bet grid order matching Bounty Football reference
 * (left→right, top→bottom): x2 x5 / x8 x18 / x66 x50 / x100 x88 / x30 x20
 */
export const BET_GRID_ORDER: string[] = [
  'aldenaire',
  'soccer_club',
  'real_madrid',
  'psg',
  'bayern',
  'porto',
  'man_united',
  'al_nassr',
  'juventus',
  'man_city',
];

export function teamById(id: string): TeamItem | undefined {
  return TEAMS.find((t) => t.id === id);
}

export function formatChip(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (amount >= 1000) {
    const k = amount / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return String(amount);
}

/** Segment angle (degrees), index 0 at top (−90°). */
export function segmentAngleDeg(index: number): number {
  return (index * 360) / WHEEL_SEGMENTS.length - 90;
}

export function segmentOffset(
  index: number,
  radius: number = WHEEL.logoRadius,
) {
  const radian = (segmentAngleDeg(index) * Math.PI) / 180;
  return {
    x: Math.cos(radian) * radius,
    y: Math.sin(radian) * radius,
  };
}

/** Pick a random wheel index that matches winner team id. */
export function pickWinSegmentIndex(winnerId: string): number {
  const matches = WHEEL_SEGMENTS.map((t, i) => (t.id === winnerId ? i : -1)).filter(
    (i) => i >= 0,
  );
  if (matches.length === 0) return 0;
  return matches[Math.floor(Math.random() * matches.length)];
}

/** Green-ring icon for a bet team (first match on the 16-icon ring). */
export function ringIconForTeam(teamId: string): RingIcon | undefined {
  return RING_ICONS.find((icon) => icon.teamId === teamId);
}
