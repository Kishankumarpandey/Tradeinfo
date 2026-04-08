// ---------------------------------------------------------------------------
// SYSTEM 2: Demo Scenario System — Three deterministic, hardcoded scenarios
// ---------------------------------------------------------------------------
import type { SignalAction } from '../types';

export interface ReasoningChain {
  event: string;
  impact: string;
  historical: string;
  asset: string;
  action: string;
  confidence: number;
  confidenceJustification: string;
}

export interface DemoScenario {
  id: string;
  label: string;
  shortLabel: string;
  originCountryIso2: string;
  originCountryName: string;
  headline: string;
  chain: ReasoningChain;
  affectedAssets: Array<{
    name: string;
    direction: 'BUY' | 'SELL' | 'HOLD';
    targetIso2?: string;
  }>;
  signalAction: SignalAction;
  signalConfidence: number;
  signalAsset: string;
  timeframe: string;
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'opec-shock',
    label: 'OPEC SHOCK',
    shortLabel: 'OPEC',
    originCountryIso2: 'SA',
    originCountryName: 'Saudi Arabia',
    headline: 'OPEC announces surprise 2M barrel/day production cut, effective immediately',
    chain: {
      event: 'OPEC announces surprise 2M barrel/day production cut, effective immediately.',
      impact: 'Global crude supply contracts sharply; energy costs surge across import-dependent economies.',
      historical: '2022 OPEC+ cut caused WTI to rise 11.3% within 72 hours.',
      asset: 'WTI Crude Oil (direct exposure), Energy ETFs (correlated), EUR/USD (inverse pressure).',
      action: 'BUY WTI Crude Oil | Timeframe: 48–72 hours',
      confidence: 0.81,
      confidenceJustification: 'Strong historical precedent + immediate supply shock + institutional consensus.',
    },
    affectedAssets: [
      { name: 'WTI Crude Oil', direction: 'BUY', targetIso2: 'US' },
      { name: 'Energy ETFs', direction: 'BUY', targetIso2: 'US' },
      { name: 'USD', direction: 'HOLD', targetIso2: 'US' },
      { name: 'BTC', direction: 'SELL', targetIso2: 'US' },
    ],
    signalAction: 'strong_buy',
    signalConfidence: 0.81,
    signalAsset: 'WTI Crude Oil',
    timeframe: '48–72 hours',
  },
  {
    id: 'gas-escalation',
    label: 'GAS ESCALATION',
    shortLabel: 'GAS',
    originCountryIso2: 'RU',
    originCountryName: 'Russia',
    headline: 'Russia suspends natural gas transit through Ukraine pipeline indefinitely',
    chain: {
      event: 'Russia suspends natural gas transit through Ukraine pipeline indefinitely.',
      impact: 'European energy security destabilized; industrial output at risk; EUR weakens on macro uncertainty.',
      historical: '2022 Nordstream disruption caused EU gas futures to spike 34% in 5 days.',
      asset: 'European Natural Gas (direct), EUR/USD (bearish), Gold (safe haven bid), Energy Stocks (bullish).',
      action: 'BUY European Gas Futures | Timeframe: 24–48 hours',
      confidence: 0.78,
      confidenceJustification: 'Geopolitical precedent confirmed + supply bottleneck + winter demand cycle.',
    },
    affectedAssets: [
      { name: 'European Natural Gas', direction: 'BUY', targetIso2: 'DE' },
      { name: 'EUR/USD', direction: 'SELL', targetIso2: 'DE' },
      { name: 'Gold', direction: 'BUY', targetIso2: 'CH' },
      { name: 'Energy Stocks', direction: 'BUY', targetIso2: 'GB' },
    ],
    signalAction: 'strong_buy',
    signalConfidence: 0.78,
    signalAsset: 'European Natural Gas',
    timeframe: '24–48 hours',
  },
  {
    id: 'tech-sanctions',
    label: 'TECH SANCTIONS',
    shortLabel: 'TECH',
    originCountryIso2: 'US',
    originCountryName: 'United States',
    headline: 'US Commerce Department bans export of advanced semiconductors to China, effective 48 hours',
    chain: {
      event: 'US Commerce Department bans export of advanced semiconductors to China, effective 48 hours.',
      impact: 'Semiconductor supply chains disrupted; China retaliatory risk priced in; tech sector reprices downward.',
      historical: 'October 2022 chip export controls caused SOX Index to drop 7.4% in 3 days.',
      asset: 'NVIDIA (short-term sell), TSMC (sell), SOX Index (sell), Gold (safe haven bid).',
      action: 'SELL SOX exposure | Timeframe: 24–96 hours',
      confidence: 0.69,
      confidenceJustification: 'Regulatory precedent + confirmed supply disruption + mixed institutional positioning.',
    },
    affectedAssets: [
      { name: 'NVIDIA', direction: 'SELL', targetIso2: 'US' },
      { name: 'TSMC', direction: 'SELL', targetIso2: 'TW' },
      { name: 'SOX Index', direction: 'SELL', targetIso2: 'US' },
      { name: 'Gold', direction: 'BUY', targetIso2: 'CH' },
    ],
    signalAction: 'strong_sell',
    signalConfidence: 0.69,
    signalAsset: 'SOX Index',
    timeframe: '24–96 hours',
  },
];
