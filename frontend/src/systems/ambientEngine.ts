// ---------------------------------------------------------------------------
// ALIVE LAYER — Ambient Intelligence Engine
// Provides continuous ambient signals, timeline pre-population, AI status cycling
// ---------------------------------------------------------------------------

export interface AmbientSignal {
  id: string;
  headline: string;
  iso2: string;
  countryName: string;
  asset: string;
  severity: 'LOW' | 'MEDIUM';
  category: string;
}

export interface TimelineEntry {
  id: string;
  headline: string;
  countryName: string;
  iso2?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  asset?: string;
  timestamp: number;
  category: string;
}

// ── Ambient Signal Pool (12+ events) ─────────────────────────────────────
const AMBIENT_POOL: Omit<AmbientSignal, 'id'>[] = [
  { headline: 'Diplomatic tension detected: India-Pakistan border region', iso2: 'IN', countryName: 'India', asset: 'INR/USD', severity: 'LOW', category: 'DIPLOMATIC' },
  { headline: 'Trade flow anomaly: South China Sea shipping lanes', iso2: 'CN', countryName: 'China', asset: 'Shipping ETFs', severity: 'LOW', category: 'TRADE' },
  { headline: 'Currency pressure signal: Turkish Lira volatility spike', iso2: 'TR', countryName: 'Turkey', asset: 'TRY/USD', severity: 'LOW', category: 'FX' },
  { headline: 'Commodity watch: Wheat futures movement correlating with Black Sea weather data', iso2: 'UA', countryName: 'Ukraine', asset: 'Wheat Futures', severity: 'LOW', category: 'COMMODITY' },
  { headline: 'Political risk flag: Brazilian election polling showing unexpected shift', iso2: 'BR', countryName: 'Brazil', asset: 'BRL, Bovespa', severity: 'LOW', category: 'POLITICAL' },
  { headline: 'Energy grid stress: European winter demand forecast revised upward', iso2: 'DE', countryName: 'Germany', asset: 'EU Gas', severity: 'LOW', category: 'ENERGY' },
  { headline: 'Sanctions watch: New OFAC additions detected in financial wire traffic', iso2: 'US', countryName: 'United States', asset: 'Sanctions-exposed ETFs', severity: 'LOW', category: 'SANCTIONS' },
  { headline: 'Port congestion detected: Rotterdam, Hamburg', iso2: 'NL', countryName: 'Netherlands', asset: 'Container ETFs', severity: 'LOW', category: 'LOGISTICS' },
  { headline: 'Central bank language shift: BOJ statement analysis in progress', iso2: 'JP', countryName: 'Japan', asset: 'JPY/USD', severity: 'LOW', category: 'CENTRAL BANK' },
  { headline: 'Sovereign debt watch: Pakistan IMF tranche review approaching', iso2: 'PK', countryName: 'Pakistan', asset: 'PKR', severity: 'LOW', category: 'SOVEREIGN' },
  { headline: 'Tech supply chain flag: TSMC utilization data below seasonal average', iso2: 'TW', countryName: 'Taiwan', asset: 'SOX', severity: 'LOW', category: 'TECH' },
  { headline: 'Conflict proximity alert: Sudan-Chad border activity elevated', iso2: 'SD', countryName: 'Sudan', asset: 'Gold', severity: 'LOW', category: 'CONFLICT' },
  { headline: 'Monetary policy signal: ECB minutes suggest hawkish pivot in Q2 guidance', iso2: 'DE', countryName: 'Germany', asset: 'EUR/USD', severity: 'LOW', category: 'CENTRAL BANK' },
  { headline: 'Resource nationalism: Indonesian nickel export quota under review', iso2: 'ID', countryName: 'Indonesia', asset: 'Nickel Futures', severity: 'LOW', category: 'COMMODITY' },
  { headline: 'Maritime choke point: Strait of Hormuz transit delays reported', iso2: 'SA', countryName: 'Saudi Arabia', asset: 'WTI Crude', severity: 'LOW', category: 'ENERGY' },
  { headline: 'Electoral volatility: Mexican peso implied vol rising ahead of state elections', iso2: 'MX', countryName: 'Mexico', asset: 'MXN/USD', severity: 'LOW', category: 'POLITICAL' },
];

// ── Pre-loaded Timeline Data ─────────────────────────────────────────────
export function generatePreloadTimeline(): TimelineEntry[] {
  const now = Date.now();
  return [
    { id: 'tl-pre-1', headline: 'Commodity watch: Brent crude open interest rising', countryName: 'Global', iso2: 'GB', severity: 'LOW', asset: 'Brent Crude', timestamp: now - 4 * 60 * 60 * 1000 - 12 * 60 * 1000, category: 'COMMODITY' },
    { id: 'tl-pre-2', headline: 'FX alert: JPY weakening trend continues — 3rd session', countryName: 'Japan', iso2: 'JP', severity: 'LOW', asset: 'JPY/USD', timestamp: now - 3 * 60 * 60 * 1000 - 44 * 60 * 1000, category: 'FX' },
    { id: 'tl-pre-3', headline: 'Political: South Korean parliamentary session — budget vote', countryName: 'South Korea', iso2: 'KR', severity: 'LOW', timestamp: now - 3 * 60 * 60 * 1000 - 1 * 60 * 1000, category: 'POLITICAL' },
    { id: 'tl-pre-4', headline: 'Trade: US-Vietnam tariff review — public comment period closes', countryName: 'United States', iso2: 'US', severity: 'LOW', timestamp: now - 2 * 60 * 60 * 1000 - 28 * 60 * 1000, category: 'TRADE' },
    { id: 'tl-pre-5', headline: 'Energy: Nigerian pipeline disruption report unconfirmed', countryName: 'Nigeria', iso2: 'NG', severity: 'LOW', asset: 'Brent Crude', timestamp: now - 1 * 60 * 60 * 1000 - 55 * 60 * 1000, category: 'ENERGY' },
    { id: 'tl-pre-6', headline: 'Diplomatic: G7 finance ministers communiqué — hawkish language detected', countryName: 'Global', iso2: 'US', severity: 'LOW', timestamp: now - 1 * 60 * 60 * 1000 - 22 * 60 * 1000, category: 'DIPLOMATIC' },
    { id: 'tl-pre-7', headline: 'Currency: Argentine peso parallel rate divergence widening', countryName: 'Argentina', iso2: 'AR', severity: 'LOW', asset: 'ARS', timestamp: now - 47 * 60 * 1000, category: 'FX' },
    { id: 'tl-pre-8', headline: 'Supply chain: Red Sea routing delays — 12% above 30-day average', countryName: 'Global', iso2: 'SA', severity: 'LOW', asset: 'Shipping ETFs', timestamp: now - 18 * 60 * 1000, category: 'LOGISTICS' },
  ];
}

// ── AI Scanning Status Lines ────────────────────────────────────────────
export const AI_SCAN_LINES: string[] = [
  'Scanning 47 active geopolitical feeds...',
  'Cross-referencing commodity price anomalies...',
  'Evaluating sentiment shift in MENA region...',
  'Updating risk weights: USD/JPY correlation model...',
  'Monitoring central bank forward guidance signals...',
  'Parsing UN Security Council session transcript...',
  'Re-evaluating conviction level: Asia-Pacific basket...',
  'No high-confidence signals in current window.',
  'Analyzing trade flow deviations across Pacific routes...',
  'Scanning sovereign CDS spreads for stress signals...',
  'Correlating satellite imagery with port throughput data...',
  'Running sentiment decay model on Eastern European feeds...',
];

// ── Utility: get random ambient signal ──────────────────────────────────
let _ambientIndex = 0;
const _shuffled = [...AMBIENT_POOL].sort(() => Math.random() - 0.5);

export function getNextAmbientSignal(): AmbientSignal {
  const sig = _shuffled[_ambientIndex % _shuffled.length];
  _ambientIndex++;
  return { ...sig, id: `ambient-${Date.now()}-${_ambientIndex}` };
}

// ── Utility: random interval in range ───────────────────────────────────
export function randomInterval(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs)) + minMs;
}
