// ---------------------------------------------------------------------------
// src/services/decision.ts — Trade decision engine (v3 w/ Memory integration)
// ---------------------------------------------------------------------------
import { MemoryTrend } from './memory';

export interface DecisionInput {
  country: string;
  sentiment_score: number;   // -1 to +1
  impact_level: 'low' | 'medium' | 'high';
  topic?: string;
  memory_trend?: MemoryTrend;
}

export interface DecisionFactor {
  type: 'sentiment' | 'trend' | 'event';
  impact: number; // -1 to +1
}

export interface DecisionExplanation {
  summary: string;
  factors: DecisionFactor[];
}

export interface Decision {
  country: string;
  action: 'buy' | 'sell' | 'hold' | 'strong_buy' | 'strong_sell';
  confidence: number;         // 0–1
  strength: 'weak' | 'moderate' | 'strong';
  explanation: DecisionExplanation;
  reason: string; // Keep legacy reason for compatibility
}

// Impact level → base confidence modifier
const IMPACT_CONFIDENCE: Record<string, number> = {
  high:   0.85,
  medium: 0.60,
  low:    0.35,
};

// Topic-specific adjustments (some topics inherently carry more market weight)
const TOPIC_WEIGHT: Record<string, number> = {
  monetary_policy:  1.3,
  military:         1.2,
  trade:            1.1,
  energy:           1.1,
  markets:          1.2,
  economy:          1.15,
  natural_disaster: 1.0,
  healthcare:       0.9,
  technology:       1.0,
  politics:         0.85,
  general:          0.7,
};

/**
 * Generate a trade decision combining current NLP signals + historical Memory trend.
 */
export function generateDecision(input: DecisionInput): Decision {
  const { country, sentiment_score, impact_level, topic, memory_trend } = input;

  const topicKey = topic ?? 'general';
  const topicMult = TOPIC_WEIGHT[topicKey] ?? 1.0;
  const baseConfidence = IMPACT_CONFIDENCE[impact_level] ?? 0.5;

  const trend = memory_trend?.trend ?? 'neutral';
  const trendStr = memory_trend?.strength ?? 0;

  let action: Decision['action'] = 'hold';

  // ── Action Matrix ─────────────────────────────────────────────────────

  const isPositive = sentiment_score > 0.15;
  const isNegative = sentiment_score < -0.15;
  const isStrongPositive = sentiment_score > 0.3;
  const isStrongNegative = sentiment_score < -0.3;

  if (trend === 'bullish' && isPositive) {
    action = trendStr > 50 && isStrongPositive ? 'strong_buy' : 'buy';
  } else if (trend === 'bearish' && isNegative) {
    action = trendStr > 50 && isStrongNegative ? 'strong_sell' : 'sell';
  } else if ((trend === 'bullish' && isNegative) || (trend === 'bearish' && isPositive)) {
    // Conflict (trend vs current news)
    action = 'hold';
  } else {
    // Trend is neutral or no historic data
    if (isStrongPositive) action = 'buy';
    else if (isStrongNegative) action = 'sell';
    else action = 'hold';
  }

  // ── Confidence & Strength ─────────────────────────────────────────────
  let confidence = baseConfidence * topicMult * (0.3 + Math.abs(sentiment_score) * 0.7);

  // Bonus/penalty based on trend alignment
  if (action === 'strong_buy' || action === 'strong_sell') {
    confidence += (trendStr / 100) * 0.2; // up to +0.2 boost
  } else if (action === 'hold' && trend !== 'neutral') {
    confidence *= 0.7; // uncertainty drops confidence
  }

  confidence = Math.min(1.0, Math.max(0.0, confidence));
  confidence = Math.round(confidence * 1000) / 1000;

  let strength: 'weak' | 'moderate' | 'strong';
  if (confidence >= 0.75) strength = 'strong';
  else if (confidence >= 0.45) strength = 'moderate';
  else strength = 'weak';

  // ── Explanation & Factors ─────────────────────────────────────────────
  const factors: DecisionFactor[] = [
    { type: 'sentiment', impact: sentiment_score },
    { type: 'trend', impact: trend === 'bullish' ? (trendStr / 100) : trend === 'bearish' ? -(trendStr / 100) : 0 },
    { type: 'event', impact: impact_level === 'high' ? 0.3 : impact_level === 'medium' ? 0.15 : 0.05 }
  ];

  const summary = buildSummary(action, trend, sentiment_score);
  const reason = buildReason(country, action, sentiment_score, impact_level, topicKey, trend, trendStr);

  return {
    country,
    action,
    confidence,
    strength,
    explanation: { summary, factors },
    reason
  };
}

function buildSummary(action: string, trend: string, sentiment: number): string {
  if (action === 'hold' && trend !== 'neutral') {
    return `Market is neutral due to conflict between ${trend} trend and ${sentiment > 0 ? 'positive' : 'negative'} news`;
  }
  if (action.includes('buy')) {
    return `Market is bullish due to ${sentiment > 0.3 ? 'strong ' : ''}positive news and ${trend === 'bullish' ? 'consistent' : 'emerging'} trend`;
  }
  if (action.includes('sell')) {
    return `Market is bearish due to ${sentiment < -0.3 ? 'sharp ' : ''}negative news and ${trend === 'bearish' ? 'prevailing' : 'developing'} trend`;
  }
  return "Market is holding steady with no clear directional signals";
}

function buildReason(
  country: string,
  action: string,
  sentiment: number,
  impact: string,
  topic: string,
  trend: string,
  trendStrength: number,
): string {
  const topicLabel = topic.replace(/_/g, ' ');

  const parts: string[] = [];

  if (action === 'strong_buy') {
    parts.push(`High conviction long: ${country} exhibits ${trend} trend (strength ${trendStrength}) confirming positive ${topicLabel} news`);
  } else if (action === 'strong_sell') {
    parts.push(`High conviction short: ${country} ongoing ${trend} trend (strength ${trendStrength}) reinforced by negative ${topicLabel} developments`);
  } else if (action === 'buy') {
    parts.push(`Positive ${topicLabel} news generates a buy signal for ${country} (impact: ${impact})`);
  } else if (action === 'sell') {
    parts.push(`Negative ${topicLabel} news triggers a sell signal for ${country} (impact: ${impact})`);
  } else {
    // Hold rationale
    if ((trend === 'bullish' && sentiment < 0) || (trend === 'bearish' && sentiment > 0)) {
      parts.push(`Conflicting signals for ${country}: historical ${trend} trend contradicts current ${sentiment > 0 ? 'positive' : 'negative'} ${topicLabel} news`);
      parts.push('Recommend holding pattern until clarity emerges');
    } else {
      parts.push(`Insufficient conviction for direction on ${country} (sentiment: ${sentiment.toFixed(2)})`);
    }
  }

  return parts.join('. ') + '.';
}
