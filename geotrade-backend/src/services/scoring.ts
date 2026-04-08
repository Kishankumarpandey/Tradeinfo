import { MemoryTrend, memoryEngine } from './memory';

export interface ConfidenceInput {
  countryId: string;
  sentiment: number;      // -1 to +1 (from NLP)
  memory_trend: MemoryTrend;
  timestamp: number;
}

/**
 * Normalizes confidence purely based on structured data rules avoiding any randomization.
 * Yields value between 0.0 and 1.0
 */
export function calculateConfidence(input: ConfidenceInput): number {
  const { countryId, sentiment, memory_trend, timestamp } = input;

  // 1. Sentiment Strength (0.0 - 0.4)
  const sentimentAbs = Math.abs(sentiment);
  const sentimentScore = Math.min(0.4, sentimentAbs * 0.6);

  // 2. Trend Memory Agreement (0.0 - 0.35)
  let trendScore = 0.1; // Base uncertainty if no trend
  if (memory_trend.trend !== 'neutral') {
    const isBull = memory_trend.trend === 'bullish';
    const isPos = sentiment > 0;
    
    // If news sentiment aligns with historical trend direction, grant high confidence
    if ((isBull && isPos) || (!isBull && !isPos)) {
      trendScore = 0.15 + (memory_trend.strength / 100) * 0.20; // Up to 0.35
    } else {
      // Conflict drops confidence severely
      trendScore = 0.0;
    }
  }

  // 3. News Frequency (0.0 - 0.25)
  // Check how many signals have been logged for this country in the last 15 minutes
  const recentHistory = memoryEngine.getHistory(countryId) ?? [];
  const FIFTEEN_MINS = 15 * 60 * 1000;
  
  const recentCount = recentHistory.filter(h => timestamp - h.timestamp <= FIFTEEN_MINS).length;
  // Cap at 5 news items for max frequency score
  const frequencyScore = Math.min(0.25, (recentCount / 5) * 0.25);

  let finalConfidence = sentimentScore + trendScore + frequencyScore;
  
  // Guarantee clamp between 0 and 1
  finalConfidence = Math.max(0, Math.min(1.0, finalConfidence));
  
  return Number(finalConfidence.toFixed(4));
}
