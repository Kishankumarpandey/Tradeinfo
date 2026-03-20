// ---------------------------------------------------------------------------
// src/services/scoring.ts — Trade signal scoring engine (0-100)
// ---------------------------------------------------------------------------
import { MemoryTrend } from './memory';

export interface SignalScoreInput {
  sentiment: number;      // -1 to +1
  impact_level: 'low' | 'medium' | 'high';
  memory_trend: MemoryTrend;
  topic: string;
}

export interface SignalScore {
  score: number;          // 0 to 100
  factors: {
    base: number;
    trendAlignment: number;
    impactBoost: number;
  };
}

/**
 * Score a signal from 0 to 100 representing its overall "quality" or "conviction".
 * Higher score = more reliable/stronger trade setup.
 */
export function scoreSignal(input: SignalScoreInput): SignalScore {
  const { sentiment, impact_level, memory_trend } = input;

  // 1. Base Score (0-40) derived from sentiment magnitude
  const sentimentAbs = Math.abs(sentiment);
  let baseScore = Math.min(40, sentimentAbs * 60);

  // 2. Trend Alignment (0-40)
  let trendAlignment = 0;
  if (memory_trend.trend !== 'neutral') {
    const isBull = memory_trend.trend === 'bullish';
    const isPos = sentiment > 0;

    if ((isBull && isPos) || (!isBull && !isPos)) {
      // Aligned! Earn points based on trend strength
      trendAlignment = Math.min(40, (memory_trend.strength / 100) * 40);
    } else {
      // Conflicting! Lose base score
      baseScore *= 0.5;
    }
  }

  // 3. Impact Boost (0-20)
  let impactBoost = 0;
  if (impact_level === 'high') impactBoost = 20;
  else if (impact_level === 'medium') impactBoost = 10;
  else impactBoost = 0;

  let totalScore = baseScore + trendAlignment + impactBoost;

  // Confidence ceiling
  totalScore = Math.min(100, Math.max(0, Math.round(totalScore)));

  return {
    score: totalScore,
    factors: {
      base: Math.round(baseScore),
      trendAlignment: Math.round(trendAlignment),
      impactBoost: Math.round(impactBoost),
    },
  };
}
