// ---------------------------------------------------------------------------
// src/sim_engine/news.ts — Local geopolitical news simulation engine
// ---------------------------------------------------------------------------
import { EventEmitter } from 'events';
import { MarketSimulator } from './simulator';

// ── Types ───────────────────────────────────────────────────────────────────

export type NewsCategory =
  | 'monetary_policy'
  | 'trade'
  | 'military'
  | 'technology'
  | 'energy'
  | 'politics'
  | 'natural_disaster'
  | 'healthcare'
  | 'infrastructure'
  | 'diplomacy';

export type Sentiment = 'positive' | 'negative' | 'neutral';

export interface NewsItem {
  id: string;
  headline: string;
  country: string;        // country name
  countryId: string;       // country id (e.g. "c0")
  category: NewsCategory;
  sentiment: Sentiment;
  impact_score: number;    // 0–100
  timestamp: number;
}

export interface NewsEngineConfig {
  seed?: number;
  intervalMs?: number;     // how often to attempt generation (default 5s)
  fireChance?: number;     // 0–1, chance of actually producing a headline each interval
}

// ── Seeded PRNG (Mulberry32) ────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Headline templates ──────────────────────────────────────────────────────
// {country} is replaced at runtime with the actual country name.

interface HeadlineTemplate {
  headline: string;
  category: NewsCategory;
  sentiment: Sentiment;
  baseImpact: number;  // 0–100 base, jittered at runtime
}

const TEMPLATES: HeadlineTemplate[] = [
  // ── Monetary policy ───────────────────────────────────────────────────
  { headline: '{country} central bank raises interest rates by 25 bps',          category: 'monetary_policy', sentiment: 'negative', baseImpact: 55 },
  { headline: '{country} central bank cuts rates to stimulate growth',           category: 'monetary_policy', sentiment: 'positive', baseImpact: 60 },
  { headline: '{country} holds rates steady amid inflation concerns',            category: 'monetary_policy', sentiment: 'neutral',  baseImpact: 30 },
  { headline: '{country} announces emergency rate hike to defend currency',      category: 'monetary_policy', sentiment: 'negative', baseImpact: 80 },
  { headline: '{country} central bank signals dovish pivot for next quarter',    category: 'monetary_policy', sentiment: 'positive', baseImpact: 50 },

  // ── Trade ─────────────────────────────────────────────────────────────
  { headline: '{country} signs historic trade deal with neighboring nations',    category: 'trade', sentiment: 'positive', baseImpact: 55 },
  { headline: '{country} imposes new tariffs on imported steel and aluminum',    category: 'trade', sentiment: 'negative', baseImpact: 50 },
  { headline: '{country} exports surge to record levels in Q3',                  category: 'trade', sentiment: 'positive', baseImpact: 45 },
  { headline: '{country} faces retaliatory trade sanctions from partners',       category: 'trade', sentiment: 'negative', baseImpact: 65 },
  { headline: '{country} joins new multilateral free trade agreement',           category: 'trade', sentiment: 'positive', baseImpact: 50 },

  // ── Military ──────────────────────────────────────────────────────────
  { headline: 'Tensions escalate as {country} deploys troops near border',       category: 'military', sentiment: 'negative', baseImpact: 75 },
  { headline: '{country} announces ceasefire agreement after months of conflict', category: 'military', sentiment: 'positive', baseImpact: 70 },
  { headline: 'War tensions rise as {country} conducts military exercises',      category: 'military', sentiment: 'negative', baseImpact: 65 },
  { headline: '{country} increases defense budget by 15% amid regional unrest',  category: 'military', sentiment: 'negative', baseImpact: 50 },
  { headline: '{country} signs landmark peace accord with rival nation',         category: 'military', sentiment: 'positive', baseImpact: 80 },

  // ── Technology ────────────────────────────────────────────────────────
  { headline: '{country} increases semiconductor production capacity',            category: 'technology', sentiment: 'positive', baseImpact: 55 },
  { headline: '{country} unveils national AI strategy with $10B investment',     category: 'technology', sentiment: 'positive', baseImpact: 60 },
  { headline: '{country} bans foreign tech companies from critical infrastructure', category: 'technology', sentiment: 'negative', baseImpact: 50 },
  { headline: '{country} launches quantum computing research initiative',        category: 'technology', sentiment: 'positive', baseImpact: 40 },
  { headline: 'Major data breach exposes millions of {country} citizens',        category: 'technology', sentiment: 'negative', baseImpact: 45 },

  // ── Energy ────────────────────────────────────────────────────────────
  { headline: '{country} discovers massive offshore oil reserves',               category: 'energy', sentiment: 'positive', baseImpact: 65 },
  { headline: '{country} commits to 100% renewable energy by 2035',             category: 'energy', sentiment: 'positive', baseImpact: 50 },
  { headline: 'Energy crisis deepens in {country} as gas prices spike',          category: 'energy', sentiment: 'negative', baseImpact: 60 },
  { headline: '{country} halts oil exports amid political disputes',             category: 'energy', sentiment: 'negative', baseImpact: 75 },
  { headline: '{country} opens new nuclear power plant',                         category: 'energy', sentiment: 'positive', baseImpact: 45 },

  // ── Politics ──────────────────────────────────────────────────────────
  { headline: '{country} president announces sweeping economic reforms',         category: 'politics', sentiment: 'positive', baseImpact: 55 },
  { headline: 'Anti-government protests erupt across {country}',                 category: 'politics', sentiment: 'negative', baseImpact: 60 },
  { headline: '{country} holds successful democratic elections',                 category: 'politics', sentiment: 'positive', baseImpact: 35 },
  { headline: 'Corruption scandal rocks {country} parliament',                   category: 'politics', sentiment: 'negative', baseImpact: 50 },
  { headline: '{country} prime minister resigns amid leadership crisis',         category: 'politics', sentiment: 'negative', baseImpact: 55 },

  // ── Natural disaster ──────────────────────────────────────────────────
  { headline: 'Devastating earthquake strikes {country}, magnitude 7.2',         category: 'natural_disaster', sentiment: 'negative', baseImpact: 80 },
  { headline: 'Massive flooding displaces thousands in {country}',               category: 'natural_disaster', sentiment: 'negative', baseImpact: 65 },
  { headline: 'Typhoon makes landfall in {country} causing widespread damage',   category: 'natural_disaster', sentiment: 'negative', baseImpact: 70 },
  { headline: '{country} hit by worst drought in 50 years',                      category: 'natural_disaster', sentiment: 'negative', baseImpact: 55 },

  // ── Healthcare ────────────────────────────────────────────────────────
  { headline: '{country} approves revolutionary disease treatment',              category: 'healthcare', sentiment: 'positive', baseImpact: 40 },
  { headline: 'New virus outbreak reported in {country}',                        category: 'healthcare', sentiment: 'negative', baseImpact: 65 },
  { headline: '{country} achieves record vaccination rate',                      category: 'healthcare', sentiment: 'positive', baseImpact: 35 },

  // ── Infrastructure ────────────────────────────────────────────────────
  { headline: '{country} announces $50B infrastructure modernization plan',      category: 'infrastructure', sentiment: 'positive', baseImpact: 55 },
  { headline: 'Major bridge collapse disrupts supply routes in {country}',       category: 'infrastructure', sentiment: 'negative', baseImpact: 45 },
  { headline: '{country} launches high-speed rail connecting major cities',      category: 'infrastructure', sentiment: 'positive', baseImpact: 40 },

  // ── Diplomacy ─────────────────────────────────────────────────────────
  { headline: '{country} withdraws from international climate agreement',        category: 'diplomacy', sentiment: 'negative', baseImpact: 50 },
  { headline: '{country} elected to UN Security Council',                        category: 'diplomacy', sentiment: 'positive', baseImpact: 30 },
  { headline: '{country} recalls ambassador amid diplomatic row',                category: 'diplomacy', sentiment: 'negative', baseImpact: 45 },
  { headline: '{country} hosts historic summit between rival nations',           category: 'diplomacy', sentiment: 'positive', baseImpact: 50 },
];

// ── NewsEngine ──────────────────────────────────────────────────────────────

export class NewsEngine extends EventEmitter {
  private sim: MarketSimulator;
  private rand: () => number;
  private intervalMs: number;
  private fireChance: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private newsCounter = 0;

  constructor(sim: MarketSimulator, config: NewsEngineConfig = {}) {
    super();
    this.sim = sim;
    this.rand = mulberry32(config.seed ?? Date.now());
    this.intervalMs = config.intervalMs ?? 5_000;
    this.fireChance = config.fireChance ?? 0.5;
  }

  start(): void {
    this.timer = setInterval(() => this.maybeGenerate(), this.intervalMs);
    console.log(`📰 News engine started (every ${this.intervalMs / 1000}s, ${this.fireChance * 100}% fire chance)`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private maybeGenerate(): void {
    if (this.rand() > this.fireChance) return;

    // Occasionally generate 2 headlines in one burst (breaking news cycle)
    const burst = this.rand() < 0.15 ? 2 : 1;
    for (let i = 0; i < burst; i++) {
      this.generate();
    }
  }

  generate(): NewsItem {
    const countries = this.sim.countries;
    const country = countries[Math.floor(this.rand() * countries.length)];
    const template = TEMPLATES[Math.floor(this.rand() * TEMPLATES.length)];

    // Jitter impact ±20 %
    const impactJitter = 1 + (this.rand() - 0.5) * 0.4;
    const impact_score = Math.round(
      Math.min(100, Math.max(0, template.baseImpact * impactJitter))
    );

    // High-risk countries boost negative impact slightly
    let adjustedImpact = impact_score;
    if (template.sentiment === 'negative' && country.profile.risk_score > 50) {
      adjustedImpact = Math.min(100, adjustedImpact + Math.round(country.profile.risk_score * 0.1));
    }

    const newsItem: NewsItem = {
      id: `news_${++this.newsCounter}`,
      headline: template.headline.replace('{country}', country.name),
      country: country.name,
      countryId: country.id,
      category: template.category,
      sentiment: template.sentiment,
      impact_score: adjustedImpact,
      timestamp: Date.now(),
    };

    this.emit('news', newsItem);
    console.log(`📰 [${newsItem.sentiment.toUpperCase()}] ${newsItem.headline} (impact: ${newsItem.impact_score})`);

    return newsItem;
  }
}
