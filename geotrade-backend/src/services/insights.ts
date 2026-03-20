// ---------------------------------------------------------------------------
// src/services/insights.ts — Real-time insight engine
//   • Listens to market ticks and macro events
//   • Generates human-readable insight messages
//   • Broadcasts via a callback (wired to WS in server.ts)
// ---------------------------------------------------------------------------
import { EventEmitter } from 'events';
import { MarketSimulator, TickPayload, CountryState } from '../sim_engine/simulator';
import { MacroEventEngine, MacroEvent, Severity } from '../sim_engine/events';

export interface Insight {
  type: 'insight';
  id: string;
  message: string;
  severity: Severity;
  timestamp: number;
  relatedCountries: string[];
}

export class InsightEngine extends EventEmitter {
  private sim: MarketSimulator;
  private events: MacroEventEngine;
  private insightCounter = 0;

  // Track recent values for trend detection
  private prevIndices = new Map<string, number[]>(); // last 10 values per country
  private cooldowns = new Map<string, number>();      // avoid spamming same insight

  constructor(sim: MarketSimulator, events: MacroEventEngine) {
    super();
    this.sim = sim;
    this.events = events;
  }

  start(): void {
    // Listen to ticks
    this.sim.on('tick', (payload: TickPayload) => this.onTick(payload));

    // Listen to macro events
    this.events.on('event', (event: MacroEvent) => this.onMacroEvent(event));

    console.log('💡 Insight engine started');
  }

  // ── Tick-based insights ─────────────────────────────────────────────────

  private onTick(payload: TickPayload): void {
    for (const country of payload.countries) {
      // Update history
      let hist = this.prevIndices.get(country.id);
      if (!hist) { hist = []; this.prevIndices.set(country.id, hist); }
      hist.push(country.index);
      if (hist.length > 30) hist.shift();

      if (hist.length < 5) continue; // need minimum data
      if (this.isOnCooldown(country.id)) continue;

      // Check for notable patterns
      this.checkStrongMoveInsight(country, hist);
      this.checkTrendInsight(country, hist);
      this.checkVolatilityInsight(country, hist);
    }
  }

  /** Large single-tick move */
  private checkStrongMoveInsight(country: CountryState, hist: number[]): void {
    const changePct = Math.abs(country.change_percent);
    if (changePct < 0.8) return;

    const direction = country.change_percent > 0 ? 'surged' : 'plunged';
    const severity: Severity = changePct > 2.0 ? 'critical' : changePct > 1.2 ? 'high' : 'medium';

    this.emitInsight({
      message: `🚀 ${country.name} index ${direction} ${changePct.toFixed(2)}% in a single tick`,
      severity,
      relatedCountries: [country.id],
    });
    this.setCooldown(country.id, 15); // 15 ticks cooldown
  }

  /** Sustained trend over multiple ticks */
  private checkTrendInsight(country: CountryState, hist: number[]): void {
    if (hist.length < 10) return;

    const recent = hist.slice(-10);
    const gains = recent.filter((v, i) => i > 0 && v > recent[i - 1]).length;
    const losses = recent.filter((v, i) => i > 0 && v < recent[i - 1]).length;

    const totalPctChange = ((recent[recent.length - 1] - recent[0]) / recent[0]) * 100;

    if (gains >= 8 && totalPctChange > 0.5) {
      const reason = country.profile.growth_trend > 0.04
        ? 'driven by strong economic growth trend'
        : 'showing sustained buying pressure';

      this.emitInsight({
        message: `📈 ${country.name} market rising — ${reason} (+${totalPctChange.toFixed(2)}% over 10 ticks)`,
        severity: 'medium',
        relatedCountries: [country.id],
      });
      this.setCooldown(country.id, 20);
    } else if (losses >= 8 && totalPctChange < -0.5) {
      const reason = country.profile.risk_score > 50
        ? 'high geopolitical risk pressuring the market'
        : 'persistent selling pressure detected';

      this.emitInsight({
        message: `📉 ${country.name} market declining — ${reason} (${totalPctChange.toFixed(2)}% over 10 ticks)`,
        severity: 'medium',
        relatedCountries: [country.id],
      });
      this.setCooldown(country.id, 20);
    }
  }

  /** Volatility spike detection */
  private checkVolatilityInsight(country: CountryState, hist: number[]): void {
    if (hist.length < 8) return;

    const recent = hist.slice(-8);
    const returns = [];
    for (let i = 1; i < recent.length; i++) {
      returns.push(Math.abs((recent[i] - recent[i - 1]) / recent[i - 1]));
    }
    const avgAbsReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

    // High vol threshold relative to country's base volatility
    const threshold = 0.015 * country.profile.volatility;
    if (avgAbsReturn > threshold) {
      this.emitInsight({
        message: `⚠️ ${country.name} experiencing unusually high volatility — exercise caution`,
        severity: 'high',
        relatedCountries: [country.id],
      });
      this.setCooldown(country.id, 30);
    }
  }

  // ── Macro-event-based insights ────────────────────────────────────────

  private onMacroEvent(event: MacroEvent): void {
    const countryNames = event.affectedCountries
      .slice(0, 4)
      .map((ac) => {
        const c = this.sim.countries.find((s) => s.id === ac.id);
        return c?.name ?? ac.id;
      });

    const nameList = countryNames.length <= 2
      ? countryNames.join(' and ')
      : `${countryNames.slice(0, -1).join(', ')}, and ${countryNames[countryNames.length - 1]}`;

    const regionList = event.affected_regions
      .map((r) => r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
      .join(', ');

    const impactDir = event.magnitude < 0 ? 'negatively' : 'positively';

    const messages: Record<string, string> = {
      war: `🔴 Armed conflict reported — ${nameList} ${impactDir} impacted. ${regionList} region on high alert`,
      ceasefire: `🟢 Ceasefire declared — markets in ${nameList} expected to stabilize`,
      sanctions: `🔴 New sanctions imposed — ${nameList} facing economic pressure across ${regionList}`,
      interest_rate_hike: `📊 Interest rates raised — ${nameList} adjusting. Strong economies absorbing impact`,
      interest_rate_cut: `📊 Rates cut to stimulate growth — ${nameList} likely to see capital inflows`,
      natural_disaster: `🌊 Natural disaster in ${regionList} — ${nameList} economies disrupted`,
      pandemic: `🦠 Pandemic outbreak declared — global markets ${impactDir} affected, ${nameList} hit hardest`,
      policy_change: `📋 Major policy reform in ${regionList} — ${nameList} recalibrating`,
      political_crisis: `🏛️ Political instability in ${regionList} — investor confidence in ${nameList} shaken`,
      trade_agreement: `🤝 New trade agreement — ${nameList} set to benefit from increased trade flows`,
      tech_boom: `💻 Tech breakthrough driving growth in ${nameList} — innovation sector rallying`,
      commodity_shock: `🛢️ Commodity prices disrupted — ${nameList} in ${regionList} facing supply chain shifts`,
    };

    this.emitInsight({
      message: messages[event.type] ?? `${event.description} — affecting ${nameList}`,
      severity: event.severity,
      relatedCountries: event.affectedCountries.map((a) => a.id),
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private emitInsight(opts: { message: string; severity: Severity; relatedCountries: string[] }): void {
    const insight: Insight = {
      type: 'insight',
      id: `ins_${++this.insightCounter}`,
      message: opts.message,
      severity: opts.severity,
      timestamp: Date.now(),
      relatedCountries: opts.relatedCountries,
    };
    this.emit('insight', insight);
  }

  private isOnCooldown(key: string): boolean {
    const expires = this.cooldowns.get(key);
    return expires !== undefined && Date.now() < expires;
  }

  private setCooldown(key: string, ticks: number): void {
    // Approximate cooldown in ms (assume ~1s per tick)
    this.cooldowns.set(key, Date.now() + ticks * 1000);
  }
}
