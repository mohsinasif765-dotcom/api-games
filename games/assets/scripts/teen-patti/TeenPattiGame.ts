import {
  _decorator,
  Component,
  Node,
  Label,
  Color,
  UITransform,
  Graphics,
  BlockInputEvents,
  EventTouch,
  view,
  ResolutionPolicy,
} from 'cc';
import {
  Card,
  HandRank,
  cardLabel,
  compareHands,
  createDeck,
  evaluateHand,
  formatChips,
  shuffle,
  suitColor,
} from './TeenPattiLogic';

const { ccclass } = _decorator;

type Seat = {
  id: string;
  name: string;
  isBot: boolean;
  chips: number;
  cards: Card[];
  seen: boolean;
  packed: boolean;
  hand?: HandRank;
  node?: Node;
  cardLabels: Label[];
  nameLabel?: Label;
  statusLabel?: Label;
};

function hexColor(hex: string): Color {
  const c = new Color();
  try {
    c.fromHEX(hex);
  } catch {
    c.set(255, 255, 255, 255);
  }
  return c;
}

@ccclass('TeenPattiGame')
export class TeenPattiGame extends Component {
  private uiLayer = 33554432;
  private root!: Node;
  private potLabel!: Label;
  private infoLabel!: Label;
  private balanceLabel!: Label;
  private actionBar!: Node;

  private boot = 1000;
  private pot = 0;
  private currentBet = 1000;
  private phase: 'idle' | 'betting' | 'showdown' = 'idle';
  private seats: Seat[] = [];

  onLoad() {
    try {
      view.setDesignResolutionSize(1280, 720, ResolutionPolicy.SHOW_ALL);
      this.buildUi();
      this.startRound();
      console.log('[TeenPattiGame] UI ready');
    } catch (e) {
      console.error('[TeenPattiGame] onLoad failed', e);
    }
  }

  start() {
    if (!this.node.getChildByName('TeenPattiRoot')) {
      console.warn('[TeenPattiGame] root missing in start(), rebuilding');
      this.buildUi();
      this.startRound();
    }
  }

  private mkNode(name: string, parent: Node, w = 100, h = 40): Node {
    const n = new Node(name);
    n.layer = this.uiLayer;
    n.parent = parent;
    const ut = n.addComponent(UITransform);
    ut.setContentSize(w, h);
    ut.setAnchorPoint(0.5, 0.5);
    return n;
  }

  private mkLabel(
    parent: Node,
    text: string,
    fontSize: number,
    color: Color,
    w = 400,
    h = 40,
  ): Label {
    const n = this.mkNode('Label', parent, w, h);
    const lab = n.addComponent(Label);
    lab.string = text;
    lab.fontSize = fontSize;
    lab.lineHeight = fontSize + 6;
    lab.color = color;
    lab.useSystemFont = true;
    lab.isBold = true;
    lab.horizontalAlign = Label.HorizontalAlign.CENTER;
    lab.verticalAlign = Label.VerticalAlign.CENTER;
    lab.overflow = Label.Overflow.NONE;
    return lab;
  }

  private mkPanel(parent: Node, w: number, h: number, fill: Color, x = 0, y = 0): Node {
    const n = this.mkNode('Panel', parent, w, h);
    n.setPosition(x, y, 0);
    const g = n.addComponent(Graphics);
    g.clear();
    g.fillColor = fill;
    g.roundRect(-w / 2, -h / 2, w, h, 18);
    g.fill();
    g.strokeColor = new Color(212, 175, 55, 180);
    g.lineWidth = 3;
    g.roundRect(-w / 2, -h / 2, w, h, 18);
    g.stroke();
    return n;
  }

  private mkButton(
    parent: Node,
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    bg: Color,
    onClick: () => void,
  ): Node {
    const n = this.mkPanel(parent, w, h, bg, x, y);
    n.addComponent(BlockInputEvents);
    const lab = this.mkLabel(n, text, 22, Color.WHITE, w - 8, h - 8);
    lab.node.setPosition(0, 0, 0);
    n.on(Node.EventType.TOUCH_END, (_e: EventTouch) => onClick(), this);
    return n;
  }

  private buildUi() {
    const existing = this.node.getChildByName('TeenPattiRoot');
    if (existing) existing.destroy();

    // Full-screen root centered on Canvas
    this.root = this.mkNode('TeenPattiRoot', this.node, 1280, 720);
    this.root.setPosition(0, 0, 0);

    // Background
    const bg = this.mkNode('BG', this.root, 1280, 720);
    const bgG = bg.addComponent(Graphics);
    bgG.fillColor = new Color(10, 40, 24, 255);
    bgG.rect(-640, -360, 1280, 720);
    bgG.fill();

    // Felt table
    this.mkPanel(this.root, 980, 460, new Color(16, 110, 55, 255), 0, 30);

    this.mkLabel(this.root, 'TEEN PATTI', 48, new Color(255, 214, 102, 255), 520, 56).node.setPosition(
      0,
      300,
      0,
    );

    this.potLabel = this.mkLabel(this.root, 'POT 0', 30, Color.WHITE, 320, 42);
    this.potLabel.node.setPosition(0, 50, 0);

    this.infoLabel = this.mkLabel(
      this.root,
      'Dealing...',
      22,
      new Color(220, 240, 220, 255),
      900,
      36,
    );
    this.infoLabel.node.setPosition(0, -10, 0);

    this.balanceLabel = this.mkLabel(
      this.root,
      'Chips: 0',
      24,
      new Color(255, 230, 150, 255),
      280,
      36,
    );
    this.balanceLabel.node.setPosition(-460, 300, 0);

    this.actionBar = this.mkNode('ActionBar', this.root, 1100, 100);
    this.actionBar.setPosition(0, -290, 0);

    const layout = [
      { id: 'p0', name: 'You', isBot: false, x: 0, y: -150 },
      { id: 'b1', name: 'Ravi', isBot: true, x: -340, y: 130 },
      { id: 'b2', name: 'Aisha', isBot: true, x: 340, y: 130 },
    ];

    this.seats = layout.map((L) => {
      const seatNode = this.mkPanel(this.root, 230, 160, new Color(0, 0, 0, 140), L.x, L.y);
      const nameLabel = this.mkLabel(seatNode, L.name, 22, Color.WHITE, 210, 30);
      nameLabel.node.setPosition(0, 58, 0);
      const statusLabel = this.mkLabel(
        seatNode,
        '',
        18,
        new Color(180, 220, 180, 255),
        210,
        26,
      );
      statusLabel.node.setPosition(0, -58, 0);

      const cardLabels: Label[] = [];
      for (let i = 0; i < 3; i++) {
        const cardNode = this.mkPanel(
          seatNode,
          56,
          78,
          new Color(248, 248, 242, 255),
          (i - 1) * 66,
          0,
        );
        const cl = this.mkLabel(cardNode, '?', 24, new Color(30, 30, 40, 255), 52, 72);
        cl.node.setPosition(0, 0, 0);
        cardLabels.push(cl);
      }

      return {
        id: L.id,
        name: L.name,
        isBot: L.isBot,
        chips: L.isBot ? 50000 : 100000,
        cards: [],
        seen: false,
        packed: false,
        node: seatNode,
        cardLabels,
        nameLabel,
        statusLabel,
      } as Seat;
    });
  }

  private clearActionBar() {
    this.actionBar.removeAllChildren();
  }

  private refreshHud() {
    this.potLabel.string = `POT ${formatChips(this.pot)}`;
    const you = this.seats[0];
    this.balanceLabel.string = `Chips: ${formatChips(you.chips)}`;
    for (const s of this.seats) {
      if (!s.statusLabel) continue;
      if (s.packed) s.statusLabel.string = 'PACKED';
      else if (this.phase === 'showdown' && s.hand) s.statusLabel.string = s.hand.label;
      else s.statusLabel.string = s.seen ? 'Seen' : 'Blind';
      this.paintCards(s);
    }
  }

  private paintCards(s: Seat) {
    for (let i = 0; i < 3; i++) {
      const lab = s.cardLabels[i];
      if (!lab || !s.cards[i]) {
        if (lab) lab.string = '';
        continue;
      }
      if (s.id === 'p0') {
        if (!s.seen && this.phase === 'betting') {
          lab.string = 'BACK';
          lab.color = new Color(30, 30, 40, 255);
        } else {
          lab.string = cardLabel(s.cards[i]);
          lab.color = hexColor(suitColor(s.cards[i].s));
        }
      } else if (this.phase === 'showdown' && !s.packed) {
        lab.string = cardLabel(s.cards[i]);
        lab.color = hexColor(suitColor(s.cards[i].s));
      } else {
        lab.string = 'BACK';
        lab.color = new Color(30, 30, 40, 255);
      }
    }
  }

  private startRound() {
    this.phase = 'betting';
    this.pot = 0;
    this.currentBet = this.boot;

    const deck = shuffle(createDeck());
    let idx = 0;
    for (const s of this.seats) {
      s.cards = [deck[idx++], deck[idx++], deck[idx++]];
      s.seen = false;
      s.packed = false;
      s.hand = undefined;
      s.chips -= this.boot;
      this.pot += this.boot;
    }

    this.infoLabel.string = `Boot ${formatChips(this.boot)} collected. Your turn — SEE or BLIND.`;
    this.refreshHud();
    this.showPlayerActions();
  }

  private activeSeats(): Seat[] {
    return this.seats.filter((s) => !s.packed);
  }

  private showPlayerActions() {
    this.clearActionBar();
    const you = this.seats[0];
    if (you.packed || this.phase !== 'betting') return;

    if (!you.seen) {
      this.mkButton(this.actionBar, 'SEE', -330, 0, 150, 60, new Color(40, 90, 180, 255), () =>
        this.onSee(),
      );
      this.mkButton(this.actionBar, 'BLIND', -150, 0, 150, 60, new Color(20, 140, 90, 255), () =>
        this.onBet(false),
      );
    } else {
      this.mkButton(this.actionBar, 'CHAAL', -150, 0, 150, 60, new Color(20, 140, 90, 255), () =>
        this.onBet(true),
      );
    }
    this.mkButton(this.actionBar, 'PACK', 30, 0, 150, 60, new Color(160, 50, 50, 255), () =>
      this.onPack(),
    );
    if (this.activeSeats().length === 2) {
      this.mkButton(this.actionBar, 'SHOW', 210, 0, 150, 60, new Color(180, 120, 20, 255), () =>
        this.onShow(),
      );
    }
    this.mkButton(this.actionBar, 'NEW', 390, 0, 120, 60, new Color(70, 70, 90, 255), () =>
      this.startRound(),
    );
  }

  private onSee() {
    const you = this.seats[0];
    you.seen = true;
    you.hand = evaluateHand(you.cards);
    this.infoLabel.string = `You saw: ${you.hand.label}. Chaal costs 2x.`;
    this.refreshHud();
    this.showPlayerActions();
  }

  private betAmount(seat: Seat): number {
    return seat.seen ? this.currentBet * 2 : this.currentBet;
  }

  private onBet(seenPlay: boolean) {
    const you = this.seats[0];
    if (seenPlay && !you.seen) this.onSee();
    const amt = this.betAmount(you);
    if (you.chips < amt) {
      this.infoLabel.string = 'Not enough chips.';
      return;
    }
    you.chips -= amt;
    this.pot += amt;
    this.currentBet = you.seen ? Math.floor(amt / 2) : amt;
    this.infoLabel.string = `You put ${formatChips(amt)}.`;
    this.refreshHud();
    this.clearActionBar();
    this.scheduleOnce(() => this.runBotsThenBack(), 0.4);
  }

  private onPack() {
    const you = this.seats[0];
    you.packed = true;
    this.infoLabel.string = 'You packed.';
    this.refreshHud();
    this.clearActionBar();
    this.finishIfOneLeft();
    if (this.phase === 'betting') this.scheduleOnce(() => this.runBotsThenBack(), 0.3);
  }

  private onShow() {
    this.resolveShowdown('You called SHOW.');
  }

  private runBotsThenBack() {
    if (this.phase !== 'betting') return;
    if (this.finishIfOneLeft()) return;

    for (const bot of this.seats.filter((s) => s.isBot && !s.packed)) {
      this.botAct(bot);
      if (this.finishIfOneLeft()) return;
    }

    if (this.seats[0].packed) {
      this.resolveShowdown('Only bots remain.');
      return;
    }
    this.infoLabel.string = 'Your turn.';
    this.refreshHud();
    this.showPlayerActions();
  }

  private botAct(bot: Seat) {
    if (!bot.seen && Math.random() < 0.55) {
      bot.seen = true;
      bot.hand = evaluateHand(bot.cards);
    }
    const strength = (bot.hand ?? evaluateHand(bot.cards)).rank;
    if (bot.seen && strength <= 1 && Math.random() < 0.35) {
      bot.packed = true;
      this.infoLabel.string = `${bot.name} packed.`;
      return;
    }
    const amt = this.betAmount(bot);
    if (bot.chips < amt) {
      bot.packed = true;
      this.infoLabel.string = `${bot.name} packed (short).`;
      return;
    }
    bot.chips -= amt;
    this.pot += amt;
    this.currentBet = bot.seen ? Math.floor(amt / 2) : amt;
    this.infoLabel.string = `${bot.name} ${bot.seen ? 'chaal' : 'blind'} ${formatChips(amt)}.`;
  }

  private finishIfOneLeft(): boolean {
    const live = this.activeSeats();
    if (live.length === 1) {
      const w = live[0];
      w.chips += this.pot;
      this.infoLabel.string = `${w.name} wins pot ${formatChips(this.pot)} (others packed).`;
      this.pot = 0;
      this.phase = 'showdown';
      this.refreshHud();
      this.clearActionBar();
      this.mkButton(this.actionBar, 'NEW ROUND', 0, 0, 220, 60, new Color(20, 140, 90, 255), () =>
        this.startRound(),
      );
      return true;
    }
    return false;
  }

  private resolveShowdown(reason: string) {
    this.phase = 'showdown';
    const live = this.activeSeats();
    for (const s of live) s.hand = evaluateHand(s.cards);
    live.sort((a, b) => compareHands(b.hand!, a.hand!));
    const winner = live[0];
    winner.chips += this.pot;
    this.infoLabel.string = `${reason} ${winner.name} wins with ${winner.hand!.label}! Pot ${formatChips(this.pot)}`;
    this.pot = 0;
    this.refreshHud();
    this.clearActionBar();
    this.mkButton(this.actionBar, 'NEW ROUND', 0, 0, 220, 60, new Color(20, 140, 90, 255), () =>
      this.startRound(),
    );
  }
}
