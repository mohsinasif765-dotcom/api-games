import fs from 'node:fs';

const files = [
  'lib/teen-patti-phaser/TeenPattiController.ts',
  'lib/lucky-777-phaser/Lucky777Controller.ts',
  'lib/lucky-77-phaser/Lucky77Controller.ts',
  'lib/hero-chest-phaser/HeroChestController.ts',
  'lib/greedy-king-phaser/GreedyKingController.ts',
  'lib/greedy-baby-phaser/GreedyBabyController.ts',
  'lib/fruit-party-phaser/FruitPartyController.ts',
  'lib/football-phaser/FootballController.ts',
  'lib/euro-roulette-phaser/EuroRouletteController.ts',
];

const re =
  /const \{ error \} = await supabase\.rpc\('place_game_bet', \{\s*p_round_id: round\.id,\s*p_option: optionId,\s*p_amount: amount,\s*\}\);/m;

const repl = `const { error, balance } = await placeBetUnified({
      slug: GAME_SLUG,
      roundId: round.id,
      option: optionId,
      amount,
    });
    if (balance != null) {
      this.balance = balance;
      this.emit('balance', this.balance);
    }`;

for (const f of files) {
  let t = fs.readFileSync(f, 'utf8');
  if (!t.includes("from '@/lib/placeBet'")) {
    t = t.replace(
      "import { supabase } from '@/lib/supabase';",
      "import { supabase } from '@/lib/supabase';\nimport { placeBetUnified } from '@/lib/placeBet';",
    );
  }
  if (!re.test(t)) {
    console.log('NOMATCH', f);
    continue;
  }
  t = t.replace(re, repl);
  fs.writeFileSync(f, t);
  console.log('OK', f);
}
