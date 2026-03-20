// ---------------------------------------------------------------------------
// src/sim_engine/events.ts — Macro event engine v2
//   • Region-aware targeting with distance-weighted drift
//   • Per-event severity, duration, affected_regions
//   • Country-strength modulation
// ---------------------------------------------------------------------------
import { EventEmitter } from 'events';
import { MarketSimulator, CountryState } from './simulator';

// ── Region & proximity model ────────────────────────────────────────────────

export type Region = 'north_america' | 'europe' | 'east_asia' | 'south_asia'
  | 'middle_east' | 'latin_america' | 'oceania' | 'africa' | 'central_asia';

/** Map every country id → region + lat/lng centroid for distance weighting */
const COUNTRY_GEO: Record<string, { region: Region; lat: number; lng: number }> = {
  c0:  { region: 'north_america', lat: 38.9,  lng: -77.0   }, // US
  c1:  { region: 'east_asia',     lat: 39.9,  lng: 116.4   }, // China
  c2:  { region: 'east_asia',     lat: 35.7,  lng: 139.7   }, // Japan
  c3:  { region: 'europe',        lat: 52.5,  lng: 13.4    }, // Germany
  c4:  { region: 'south_asia',    lat: 28.6,  lng: 77.2    }, // India
  c5:  { region: 'europe',        lat: 51.5,  lng: -0.1    }, // UK
  c6:  { region: 'europe',        lat: 48.9,  lng: 2.3     }, // France
  c7:  { region: 'latin_america', lat: -15.8, lng: -47.9   }, // Brazil
  c8:  { region: 'north_america', lat: 45.4,  lng: -75.7   }, // Canada
  c9:  { region: 'east_asia',     lat: 37.6,  lng: 127.0   }, // S. Korea
  c10: { region: 'oceania',       lat: -35.3, lng: 149.1   }, // Australia
  c11: { region: 'central_asia',  lat: 55.8,  lng: 37.6    }, // Russia
  c12: { region: 'latin_america', lat: 19.4,  lng: -99.1   }, // Mexico
  c13: { region: 'south_asia',    lat: -6.2,  lng: 106.8   }, // Indonesia
  c14: { region: 'middle_east',   lat: 24.7,  lng: 46.7    }, // Saudi Arabia
  c15: { region: 'europe',        lat: 46.9,  lng: 7.4     }, // Switzerland
  c16: { region: 'middle_east',   lat: 39.9,  lng: 32.9    }, // Turkey
  c17: { region: 'europe',        lat: 52.4,  lng: 4.9     }, // Netherlands
  c18: { region: 'east_asia',     lat: 25.0,  lng: 121.5   }, // Taiwan
  c19: { region: 'europe',        lat: 59.3,  lng: 18.1    }, // Sweden
};

/** Haversine-ish distance in km (simplified) */
function geoDist(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ── Types ───────────────────────────────────────────────────────────────────

export type MacroEventType =
  | 'war'
  | 'ceasefire'
  | 'interest_rate_hike'
  | 'interest_rate_cut'
  | 'natural_disaster'
  | 'policy_change'
  | 'trade_agreement'
  | 'political_crisis'
  | 'tech_boom'
  | 'commodity_shock'
  | 'pandemic'
  | 'sanctions';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface MacroEvent {
  id: string;
  type: MacroEventType;
  severity: Severity;
  affected_regions: Region[];
  affectedCountries: { id: string; weight: number }[];   // per-country weighted impact
  magnitude: number;
  durationTicks: number;
  timestamp: number;
  description: string;
}

export interface EventEngineConfig {
  seed?: number;
  frequencyMs?: number;
  maxAffected?: number;
}

// ── Seeded PRNG ─────────────────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Event templates with regions, severity, targeting logic ─────────────────

interface EventTemplate {
  type: MacroEventType;
  description: string;
  severity: Severity;
  baseMagnitude: number;
  baseDuration: number;
  affected_regions: Region[];
  /** 'proximity' → nearby countries hit harder; 'economic' → strong economies hit harder */
  targeting: 'proximity' | 'economic' | 'regional' | 'global';
}

const EVENT_TEMPLATES: EventTemplate[] = [
  // ── Military / geopolitical ────────────────────────────────────────────
  { type: 'war',               description: 'Armed conflict erupts',
    severity: 'critical', baseMagnitude: -0.010, baseDuration: 60,
    affected_regions: ['middle_east', 'central_asia'], targeting: 'proximity' },

  { type: 'ceasefire',         description: 'Ceasefire agreement reached',
    severity: 'medium',  baseMagnitude:  0.006, baseDuration: 30,
    affected_regions: ['middle_east', 'central_asia'], targeting: 'proximity' },

  { type: 'sanctions',         description: 'International sanctions imposed',
    severity: 'high',    baseMagnitude: -0.007, baseDuration: 45,
    affected_regions: ['central_asia', 'middle_east'], targeting: 'proximity' },

  // ── Economic / monetary ────────────────────────────────────────────────
  { type: 'interest_rate_hike', description: 'Central bank raises interest rates',
    severity: 'medium',  baseMagnitude: -0.004, baseDuration: 35,
    affected_regions: ['north_america', 'europe'], targeting: 'economic' },

  { type: 'interest_rate_cut',  description: 'Central bank cuts interest rates',
    severity: 'medium',  baseMagnitude:  0.005, baseDuration: 30,
    affected_regions: ['north_america', 'europe'], targeting: 'economic' },

  { type: 'trade_agreement',    description: 'New multilateral trade agreement signed',
    severity: 'low',     baseMagnitude:  0.003, baseDuration: 40,
    affected_regions: ['east_asia', 'europe', 'north_america'], targeting: 'economic' },

  // ── Natural / health ───────────────────────────────────────────────────
  { type: 'natural_disaster',   description: 'Major natural disaster strikes',
    severity: 'high',    baseMagnitude: -0.008, baseDuration: 25,
    affected_regions: ['east_asia', 'south_asia', 'oceania'], targeting: 'proximity' },

  { type: 'pandemic',           description: 'Pandemic outbreak declared',
    severity: 'critical', baseMagnitude: -0.009, baseDuration: 80,
    affected_regions: ['east_asia', 'europe', 'north_america', 'south_asia'], targeting: 'global' },

  // ── Political / policy ─────────────────────────────────────────────────
  { type: 'policy_change',      description: 'Government enacts sweeping policy reform',
    severity: 'medium',  baseMagnitude:  0.003, baseDuration: 45,
    affected_regions: ['europe', 'north_america'], targeting: 'regional' },

  { type: 'political_crisis',   description: 'Political instability shakes confidence',
    severity: 'high',    baseMagnitude: -0.006, baseDuration: 20,
    affected_regions: ['latin_america', 'middle_east', 'africa'], targeting: 'proximity' },

  // ── Tech / commodity ───────────────────────────────────────────────────
  { type: 'tech_boom',          description: 'Breakthrough technology drives growth',
    severity: 'medium',  baseMagnitude:  0.006, baseDuration: 55,
    affected_regions: ['north_america', 'east_asia'], targeting: 'economic' },

  { type: 'commodity_shock',    description: 'Commodity prices surge unexpectedly',
    severity: 'high',    baseMagnitude: -0.005, baseDuration: 22,
    affected_regions: ['middle_east', 'latin_america', 'africa'], targeting: 'regional' },
];

const SEVERITY_MULTIPLIER: Record<Severity, number> = {
  low: 0.6,
  medium: 1.0,
  high: 1.5,
  critical: 2.2,
};

// ── MacroEventEngine ────────────────────────────────────────────────────────
export class MacroEventEngine extends EventEmitter {
  private sim: MarketSimulator;
  private rand: () => number;
  private frequencyMs: number;
  private maxAffected: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private eventCounter = 0;

  constructor(sim: MarketSimulator, config: EventEngineConfig = {}) {
    super();
    this.sim = sim;
    this.rand = mulberry32(config.seed ?? Date.now());
    this.frequencyMs = config.frequencyMs ?? 15_000;
    this.maxAffected = config.maxAffected ?? 8;
  }

  start(): void {
    this.timer = setInterval(() => this.maybeGenerate(), this.frequencyMs);
    console.log(`🌐 Macro event engine started (avg every ${this.frequencyMs / 1000}s)`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private maybeGenerate(): void {
    if (this.rand() > 0.4) return;
    this.generateEvent();
  }

  generateEvent(): MacroEvent {
    const template = EVENT_TEMPLATES[Math.floor(this.rand() * EVENT_TEMPLATES.length)];
    const countries = this.sim.countries;

    // Severity multiplier with ±20 % jitter
    const severityMult = SEVERITY_MULTIPLIER[template.severity] * (0.8 + this.rand() * 0.4);
    const baseMag = template.baseMagnitude * severityMult;

    // Duration with ±30 % jitter
    const durationTicks = Math.max(5, Math.round(template.baseDuration * (0.7 + this.rand() * 0.6)));

    // ── Determine per-country impact weights ────────────────────────────
    // Pick an "epicentre" from the affected_regions
    const epicenterRegion = template.affected_regions[
      Math.floor(this.rand() * template.affected_regions.length)
    ];

    // Find a geo point for epicentre (first country in that region or random)
    const epicCountryId = Object.entries(COUNTRY_GEO)
      .find(([, g]) => g.region === epicenterRegion)?.[0];
    const epicGeo = epicCountryId
      ? COUNTRY_GEO[epicCountryId]
      : { lat: 0, lng: 0 };

    const weighted: { id: string; weight: number }[] = [];

    for (const c of countries) {
      const geo = COUNTRY_GEO[c.id];
      if (!geo) continue;

      let weight = 0;

      switch (template.targeting) {
        case 'proximity': {
          // Countries in affected_regions get base weight; distance decays impact
          const inRegion = template.affected_regions.includes(geo.region);
          const dist = geoDist(epicGeo, geo);
          const distDecay = Math.max(0.05, 1 - dist / 20_000); // 0.05 at max distance
          weight = inRegion ? (0.7 + 0.3 * distDecay) : distDecay * 0.4;
          break;
        }

        case 'economic': {
          // Strong economies (high gdp_weight) are affected more
          const inRegion = template.affected_regions.includes(geo.region);
          weight = c.profile.gdp_weight * (inRegion ? 1.0 : 0.3);
          break;
        }

        case 'regional': {
          // Only countries in affected_regions
          const inRegion = template.affected_regions.includes(geo.region);
          weight = inRegion ? 0.8 + this.rand() * 0.2 : 0.05;
          break;
        }

        case 'global': {
          // Everyone hit, regions slightly more
          const inRegion = template.affected_regions.includes(geo.region);
          weight = inRegion ? 0.9 : 0.5 + this.rand() * 0.2;
          break;
        }
      }

      // Country strength modulation:
      //   Strong economies (high gdp_weight) → dampened negative impact
      //   Weak economies → amplified negative impact
      if (baseMag < 0) {
        weight *= (1.5 - c.profile.gdp_weight); // weak countries take a harder hit
      } else {
        weight *= (0.5 + c.profile.gdp_weight); // strong countries benefit more from positive
      }

      if (weight > 0.01) {
        weighted.push({ id: c.id, weight: Math.min(weight, 2.0) });
      }
    }

    // Sort by weight and cap
    weighted.sort((a, b) => b.weight - a.weight);
    const affected = weighted.slice(0, this.maxAffected);

    // Apply weighted drift to each country
    for (const entry of affected) {
      this.sim.applyDriftModifier([entry.id], baseMag * entry.weight, durationTicks);
    }

    const event: MacroEvent = {
      id: `evt_${++this.eventCounter}`,
      type: template.type,
      severity: template.severity,
      affected_regions: template.affected_regions,
      affectedCountries: affected,
      magnitude: baseMag,
      durationTicks,
      timestamp: Date.now(),
      description: `${template.description} [${template.severity.toUpperCase()}] — ${affected.length} countries impacted`,
    };

    this.emit('event', event);
    console.log(`⚡ ${event.description} [${event.type}] mag=${baseMag.toFixed(5)} dur=${durationTicks}`);

    return event;
  }
}
