// ---------------------------------------------------------------------------
// src/services/pipeline.ts — News → NLP → Decision pipeline
// ---------------------------------------------------------------------------
import { getLatestNews, RawNewsItem } from './news';
import { analyzeText, NlpResult } from './nlp';
import { generateDecision, Decision } from './decision';
import { memoryEngine } from './memory';
import { scoreSignal } from './scoring';

export interface TradeSignal {
  country: string;
  action: 'buy' | 'sell' | 'hold' | 'strong_buy' | 'strong_sell';
  confidence: number;
  strength: 'weak' | 'moderate' | 'strong';
  score: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  trend_strength: number;
  reason: string;
  source_headline: string;
  topic: string;
  sentiment_score: number;
  timestamp: number;
}

export interface PipelineResult {
  signals: TradeSignal[];
  processed: number;
  timestamp: number;
}

/**
 * Run the full pipeline:
 *   1. Fetch live news from RSS feeds
 *   2. Process each headline through NLP
 *   3. Generate trade decisions
 *   4. Aggregate and deduplicate per-country (strongest signal wins)
 */
export async function runPipeline(): Promise<PipelineResult> {
  // ── 1. Fetch news ─────────────────────────────────────────────────────
  let newsItems: RawNewsItem[];
  try {
    newsItems = await getLatestNews();
  } catch {
    console.warn('⚠️ Pipeline: failed to fetch news, returning empty');
    return { signals: [], processed: 0, timestamp: Date.now() };
  }

  if (newsItems.length === 0) {
    return { signals: [], processed: 0, timestamp: Date.now() };
  }

  // ── 2. NLP analysis ───────────────────────────────────────────────────
  const analyzed: { news: RawNewsItem; nlp: NlpResult }[] = [];

  for (const news of newsItems) {
    const text = `${news.title} ${news.description}`;
    const nlp = analyzeText(text);

    // Skip if no country detected or negligible sentiment
    if (nlp.country === 'Unknown' && Math.abs(nlp.sentiment_score) < 0.1) continue;

    analyzed.push({ news, nlp });
  }

  // ── 3. Generate decisions & Memory integration ─────────────────────────
  const allSignals: TradeSignal[] = analyzed.map(({ news, nlp }) => {
    const memTrend = memoryEngine.getTrend(nlp.country);

    const decision = generateDecision({
      country: nlp.country,
      sentiment_score: nlp.sentiment_score,
      impact_level: nlp.impact_level,
      topic: nlp.topic,
      memory_trend: memTrend,
    });

    const scoreData = scoreSignal({
      sentiment: nlp.sentiment_score,
      impact_level: nlp.impact_level,
      memory_trend: memTrend,
      topic: nlp.topic,
    });

    // Record into short-term memory
    memoryEngine.addSignal(nlp.country, {
      sentiment: nlp.sentiment_score,
      confidence: decision.confidence,
      action: decision.action,
      timestamp: news.timestamp,
      topic: nlp.topic,
    });

    return {
      country: decision.country,
      action: decision.action,
      confidence: decision.confidence,
      strength: decision.strength,
      score: scoreData.score,
      trend: memTrend.trend,
      trend_strength: memTrend.strength,
      reason: decision.reason,
      source_headline: news.title,
      topic: nlp.topic,
      sentiment_score: nlp.sentiment_score,
      timestamp: news.timestamp,
    };
  });

  // ── 4. Aggregate: keep strongest signal per country ───────────────────
  const byCountry = new Map<string, TradeSignal>();

  for (const signal of allSignals) {
    const existing = byCountry.get(signal.country);
    if (!existing || signal.confidence > existing.confidence) {
      byCountry.set(signal.country, signal);
    }
  }

  // Sort by score descending
  const signals = [...byCountry.values()].sort((a, b) => b.score - a.score);

  return {
    signals,
    processed: newsItems.length,
    timestamp: Date.now(),
  };
}

/**
 * Run pipeline with fallback: if RSS fails, analyze simulated news instead.
 */
export async function runPipelineSafe(): Promise<PipelineResult> {
  const result = await runPipeline();

  // If no signals (RSS might be blocked), return empty gracefully
  if (result.signals.length === 0) {
    console.log('📡 Pipeline: no actionable signals from live feeds');
  } else {
    console.log(`📡 Pipeline: ${result.signals.length} signals from ${result.processed} articles`);
  }

  return result;
}
