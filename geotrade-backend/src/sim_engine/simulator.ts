// ---------------------------------------------------------------------------
// src/sim_engine/simulator.ts — Market simulation engine (v2)
// ---------------------------------------------------------------------------
import { EventEmitter } from 'events';

// ── Types ───────────────────────────────────────────────────────────────────

/** Economic profile for each country — drives per-country simulation dynamics */
export interface CountryProfile {
  gdp_weight: number;     // 0–1, relative economic power (higher = more stable)
  volatility: number;     // base volatility multiplier (0.5 = calm, 2.0 = chaotic)
  risk_score: number;     // 0–100, geopolitical risk (higher = wilder swings)
  growth_trend: number;   // annualised drift direction (-0.05 to +0.10 typical)
}

export interface CountryState {
  id: string;
  name: string;
  index: number;
  change_percent: number;
  volume: number;
  profile: CountryProfile;
}

export interface TickPayload {
  timestamp: number;
  countries: CountryState[];
}

export interface SimulatorConfig {
  numCountries?: number;
  tickIntervalMs?: number;
  seed?: number;
  meanDrift?: number;      // global baseline drift (added on top of per-country growth_trend)
  volatility?: number;     // global volatility baseline
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

// ── Default country pool with realistic economic profiles ───────────────────
const COUNTRY_DEFS: { name: string; profile: CountryProfile }[] = [
  //                                 gdp_w  vol   risk  growth
  { name: 'United States',   profile: { gdp_weight: 0.95, volatility: 0.7,  risk_score: 18, growth_trend:  0.035 } },
  { name: 'China',           profile: { gdp_weight: 0.88, volatility: 1.0,  risk_score: 35, growth_trend:  0.055 } },
  { name: 'Japan',           profile: { gdp_weight: 0.75, volatility: 0.6,  risk_score: 12, growth_trend:  0.010 } },
  { name: 'Germany',         profile: { gdp_weight: 0.72, volatility: 0.65, risk_score: 14, growth_trend:  0.015 } },
  { name: 'India',           profile: { gdp_weight: 0.60, volatility: 1.3,  risk_score: 40, growth_trend:  0.070 } },
  { name: 'United Kingdom',  profile: { gdp_weight: 0.68, volatility: 0.75, risk_score: 20, growth_trend:  0.018 } },
  { name: 'France',          profile: { gdp_weight: 0.67, volatility: 0.70, risk_score: 19, growth_trend:  0.014 } },
  { name: 'Brazil',          profile: { gdp_weight: 0.45, volatility: 1.5,  risk_score: 55, growth_trend:  0.030 } },
  { name: 'Canada',          profile: { gdp_weight: 0.62, volatility: 0.65, risk_score: 10, growth_trend:  0.022 } },
  { name: 'South Korea',     profile: { gdp_weight: 0.55, volatility: 0.85, risk_score: 28, growth_trend:  0.028 } },
  { name: 'Australia',       profile: { gdp_weight: 0.52, volatility: 0.70, risk_score: 12, growth_trend:  0.025 } },
  { name: 'Russia',          profile: { gdp_weight: 0.40, volatility: 2.0,  risk_score: 75, growth_trend: -0.010 } },
  { name: 'Mexico',          profile: { gdp_weight: 0.38, volatility: 1.4,  risk_score: 50, growth_trend:  0.020 } },
  { name: 'Indonesia',       profile: { gdp_weight: 0.35, volatility: 1.2,  risk_score: 42, growth_trend:  0.050 } },
  { name: 'Saudi Arabia',    profile: { gdp_weight: 0.42, volatility: 1.1,  risk_score: 45, growth_trend:  0.025 } },
  { name: 'Switzerland',     profile: { gdp_weight: 0.60, volatility: 0.45, risk_score:  5, growth_trend:  0.012 } },
  { name: 'Turkey',          profile: { gdp_weight: 0.30, volatility: 1.8,  risk_score: 65, growth_trend:  0.040 } },
  { name: 'Netherlands',     profile: { gdp_weight: 0.55, volatility: 0.60, risk_score: 10, growth_trend:  0.018 } },
  { name: 'Taiwan',          profile: { gdp_weight: 0.48, volatility: 0.90, risk_score: 50, growth_trend:  0.032 } },
  { name: 'Sweden',          profile: { gdp_weight: 0.50, volatility: 0.55, risk_score:  8, growth_trend:  0.020 } },
];

// ── MarketSimulator ─────────────────────────────────────────────────────────
export class MarketSimulator extends EventEmitter {
  private states: CountryState[];
  private timer: ReturnType<typeof setInterval> | null = null;
  private _tickIntervalMs: number;
  private globalDrift: number;
  private globalVolatility: number;
  private rand: () => number;
  private _running = false;

  constructor(config: SimulatorConfig = {}) {
    super();
    const n = config.numCountries ?? 12;
    this._tickIntervalMs = config.tickIntervalMs ?? 1000;
    this.globalDrift = config.meanDrift ?? 0.0001;
    this.globalVolatility = config.volatility ?? 0.012;
    this.rand = mulberry32(config.seed ?? Date.now());

    this.states = Array.from({ length: Math.min(n, COUNTRY_DEFS.length) }, (_, i) => {
      const def = COUNTRY_DEFS[i];
      // Strong GDP-weight economies start at higher base indices
      const baseIndex = 1000 + def.profile.gdp_weight * 4000;
      return {
        id: `c${i}`,
        name: def.name,
        index: baseIndex + (this.rand() - 0.5) * 500, // slight jitter
        change_percent: 0,
        volume: 0,
        profile: { ...def.profile },
      };
    });
  }

  /** Access a snapshot of current country states */
  get countries(): readonly CountryState[] {
    return this.states;
  }

  get running(): boolean {
    return this._running;
  }

  /** Apply an external drift modifier to specific countries */
  applyDriftModifier(countryIds: string[], driftDelta: number, durationTicks: number): void {
    for (const id of countryIds) {
      const state = this.states.find((s) => s.id === id);
      if (state) {
        (state as any).__driftMod = { delta: driftDelta, remaining: durationTicks };
      }
    }
  }

  start(): void {
    if (this._running) return;
    this._running = true;
    this.timer = setInterval(() => this.tick(), this._tickIntervalMs);
    console.log(`⏱️  Simulator started (tick every ${this._tickIntervalMs}ms)`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this._running = false;
    console.log('⏹️  Simulator stopped');
  }

  setSpeed(ms: number): void {
    this._tickIntervalMs = ms;
    if (this._running) {
      this.stop();
      this.start();
    }
  }

  // ── Core price-update formula ───────────────────────────────────────────
  //
  //   new_index = prev_index
  //             + drift(growth_trend)        — per-country directional pull
  //             + volatility_noise            — scaled by country volatility & risk
  //             + event_impact               — injected macro-event drift modifier
  //
  //   • High risk_score  → amplified noise  (wilder swings)
  //   • High gdp_weight  → dampened noise   (stability buffer)
  //   • Positive growth_trend → upward drift
  // ────────────────────────────────────────────────────────────────────────

  /** Advance one tick — also callable externally for tests */
  tick(): void {
    const timestamp = Date.now();

    for (const state of this.states) {
      const { profile } = state;
      const prevIndex = state.index;

      // ── 1. Drift component (growth_trend) ──────────────────────────────
      // Convert annual growth_trend to per-tick drift.
      // Assume ~252 trading days × 86400 seconds ÷ tickInterval gives ticks/year.
      // For simplicity we scale: per-tick drift ≈ growth_trend / 25200
      const perTickGrowthDrift = profile.growth_trend / 25_200;

      // ── 2. Event impact (external macro-event modifier) ────────────────
      let eventImpact = 0;
      const mod = (state as any).__driftMod as { delta: number; remaining: number } | undefined;
      if (mod) {
        eventImpact = mod.delta;
        mod.remaining--;
        if (mod.remaining <= 0) delete (state as any).__driftMod;
      }

      // Effective drift = global baseline + country growth drift + event impact
      const effectiveDrift = this.globalDrift + perTickGrowthDrift + eventImpact;

      // ── 3. Volatility noise ────────────────────────────────────────────
      // Gaussian via Box-Muller
      const u1 = this.rand();
      const u2 = this.rand();
      const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);

      // Risk amplifier: risk_score 0→1x, 50→1.5x, 100→2x
      const riskAmplifier = 1 + (profile.risk_score / 100);

      // GDP stability buffer: higher GDP weight → dampened noise
      // gdp_weight 1.0→0.5x damping, 0.0→1.5x amplification
      const stabilityDamper = 1.5 - profile.gdp_weight;

      const effectiveVolatility =
        this.globalVolatility * profile.volatility * riskAmplifier * stabilityDamper;

      const noise = effectiveVolatility * z;

      // ── 4. Final index update ──────────────────────────────────────────
      // index = previous + drift(growth_trend) + volatility noise + event impact
      const returnPct = effectiveDrift + noise;
      state.index = prevIndex * (1 + returnPct);

      // Prevent index from going negative (floor at 1.0)
      if (state.index < 1) state.index = 1;

      state.change_percent = ((state.index - prevIndex) / prevIndex) * 100;

      // Volume scales with volatility and risk — volatile markets trade heavier
      const volMultiplier = 0.5 + profile.volatility * riskAmplifier * 0.5;
      state.volume = Math.floor((50_000 + this.rand() * 450_000) * volMultiplier);
    }

    const payload: TickPayload = { timestamp, countries: [...this.states] };
    this.emit('tick', payload);
  }
}
