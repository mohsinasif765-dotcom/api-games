/**
 * Offline Monte-Carlo mirroring public.pick_weighted_option RTP bias.
 * Usage: node scripts/simulate-rtp-local.mjs [rtp=92] [n=50000]
 */

const rtp = Number(process.argv[2] || 92);
const n = Math.floor(Number(process.argv[3] || 50000));

const options = [
  { id: 'a', multiplier: 45 },
  { id: 'b', multiplier: 25 },
  { id: 'c', multiplier: 15 },
  { id: 'd', multiplier: 10 },
  { id: 'e', multiplier: 5 },
  { id: 'f', multiplier: 5 },
  { id: 'g', multiplier: 5 },
  { id: 'h', multiplier: 5 },
];

function pickWeightedOption(opts, targetRtp) {
  if (!opts?.length) return null;
  let sumInv = 0;
  let mMax = 0;
  for (const o of opts) {
    const mult = Math.max(Number(o.multiplier) || 1, 0.01);
    sumInv += 1 / mult;
    if (mult > mMax) mMax = mult;
  }
  if (sumInv <= 0) return opts[opts.length - 1].id;

  const r0 = 1 / sumInv;
  const nOpts = opts.length;

  let sumFair = 0;
  let sumBias = 0;
  const fairW = [];
  const biasW = [];
  for (const o of opts) {
    const mult = Math.max(Number(o.multiplier) || 1, 0.01);
    const wFair = 1000 / mult;
    const wBias = wFair * (mMax / mult);
    fairW.push(wFair);
    biasW.push(wBias);
    sumFair += wFair;
    sumBias += wBias;
  }

  let eFair = 0;
  let eBias = 0;
  for (let i = 0; i < opts.length; i++) {
    const mult = Math.max(Number(opts[i].multiplier) || 1, 0.01);
    eFair += (fairW[i] / sumFair) * mult;
    eBias += (biasW[i] / sumBias) * mult;
  }

  let useFair = true;
  if (targetRtp != null && targetRtp > 0) {
    const tFrac = Math.min(
      Math.max(targetRtp / 100, eBias / nOpts),
      r0,
    );
    if (eFair > eBias) {
      let pFair = (tFrac * nOpts - eBias) / (eFair - eBias);
      pFair = Math.min(Math.max(pFair, 0), 1);
      useFair = Math.random() < pFair;
    }
  }

  const weights = useFair ? fairW : biasW;
  const total = useFair ? sumFair : sumBias;
  let r = Math.random() * total;
  let acc = 0;
  for (let i = 0; i < opts.length; i++) {
    acc += weights[i];
    if (r <= acc) return opts[i].id;
  }
  return opts[opts.length - 1].id;
}

function empiricalEvenBetRtp(target) {
  let sumMult = 0;
  for (let i = 0; i < n; i++) {
    const winner = pickWeightedOption(options, target);
    const mult = options.find((o) => o.id === winner)?.multiplier ?? 1;
    sumMult += mult;
  }
  return sumMult / n / options.length;
}

const sumInv = options.reduce((s, o) => s + 1 / o.multiplier, 0);
const r0 = 1 / sumInv;

console.log(
  JSON.stringify(
    {
      n,
      target_rtp_percent: rtp,
      fair_proxy_R0_percent: Number((r0 * 100).toFixed(4)),
      fair_even_bet_rtp_percent: Number(
        (empiricalEvenBetRtp(null) * 100).toFixed(4),
      ),
      biased_even_bet_rtp_percent: Number(
        (empiricalEvenBetRtp(rtp) * 100).toFixed(4),
      ),
    },
    null,
    2,
  ),
);
