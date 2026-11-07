import sharp from 'sharp';
import fs from 'fs';

const outDir = 'public/euro-roulette/chips';
fs.mkdirSync(outDir, { recursive: true });

async function chip(name, color, label, stroke) {
  const size = 128;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs>
      <radialGradient id="g" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.35"/>
        <stop offset="45%" stop-color="${color}"/>
        <stop offset="100%" stop-color="${stroke}"/>
      </radialGradient>
    </defs>
    <circle cx="64" cy="64" r="58" fill="url(#g)" stroke="${stroke}" stroke-width="6"/>
    <circle cx="64" cy="64" r="44" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="3" stroke-dasharray="6 5"/>
    <text x="64" y="74" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="34" font-weight="900" fill="#fff" stroke="rgba(0,0,0,0.4)" stroke-width="2">${label}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 90 }).toFile(`${outDir}/${name}.webp`);
  console.log('wrote', name);
}

await chip('chip_200', '#43A047', '200', '#1B5E20');
await chip('chip_500', '#EC407A', '500', '#880E4F');
await chip('chip_1k', '#FB8C00', '1K', '#E65100');
await chip('chip_5k', '#E53935', '5K', '#B71C1C');
