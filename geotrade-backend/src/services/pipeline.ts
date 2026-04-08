import { RawNewsItem } from './news';
import { analyzeText } from './nlp';
import { memoryEngine } from './memory';
import { calculateConfidence } from './scoring';
import { resolveCountryRef } from './countryRegistry';
import { generateReasoning } from './ollama';
import { mapCountryToBinanceSymbol } from './assetMapper';

export interface TradeSignal {
  countryId: string;
  country: string;
  lat: number;
  lng: number;
  
  // Real LLM output mappings
  cause: string;
  impact: string;
  asset: string;
  decision: 'buy' | 'sell' | 'hold' | 'strong_buy' | 'strong_sell';
  confidence: number;
  
  timestamp: number;
  source_headline: string;
}

function isValidTradeSignal(signal: Partial<TradeSignal>): signal is TradeSignal {
  const hasCountry = Boolean(signal.country && signal.country.trim().length > 0);
  const hasAsset = Boolean(signal.asset && signal.asset.trim().length > 0);
  const hasValidCoords = Number.isFinite(signal.lat)
    && Number.isFinite(signal.lng)
    && signal.lat! >= -90
    && signal.lat! <= 90
    && signal.lng! >= -180
    && signal.lng! <= 180;
  const hasConfidence = Number.isFinite(signal.confidence) && signal.confidence! >= 0 && signal.confidence! <= 1;

  return hasCountry && hasAsset && hasValidCoords && hasConfidence;
}

/**
 * Process a single news item instantly when it arrives via the RSS Webhook/Emitter.
 */
export async function processNewsItem(news: RawNewsItem): Promise<TradeSignal | null> {
  const startMs = Date.now();
  console.log(`\n--- [PIPELINE START] NEWS RECEIVED ---`);
  console.log(`Headline: ${news.title}`);
  
  // 1. Base NLP Extraction
  const text = `${news.title} ${news.description}`;
  const nlp = analyzeText(text);

  if (!nlp.countryId || Math.abs(nlp.sentiment_score) < 0.1) {
    console.log(`[PIPELINE] Dropped: No specific country or insufficient sentiment magnitude.`);
    return null;
  }

  // 2. Query Local LLM (Ollama)
  console.log(`[PIPELINE] Querying Ollama LLM for reasoning...`);
  const ollamaRes = await generateReasoning(news.title, nlp.country, nlp.sentiment_score);
  
  if (!ollamaRes) {
    console.error(`[PIPELINE] Skip: Ollama failed to parse or network error. No fake data fallback allowed.`);
    return null;
  }
  
  console.log(`[PIPELINE] LLM RESPONSE:\nCause: ${ollamaRes.cause}\nImpact: ${ollamaRes.impact}\nAsset: ${ollamaRes.asset}\nAction: ${ollamaRes.decision}`);

  // 3. Compute Deterministic Confidence
  const memTrend = memoryEngine.getTrend(nlp.countryId);
  const confidence = calculateConfidence({
    countryId: nlp.countryId,
    sentiment: nlp.sentiment_score,
    memory_trend: memTrend,
    timestamp: news.timestamp
  });

  // 4. Resolve Geospatial Data & Real Asset Base
  const resolvedCountry = resolveCountryRef(nlp.countryId) ?? resolveCountryRef(nlp.country);
  const lat = typeof resolvedCountry?.lat === 'number' ? resolvedCountry.lat : NaN;
  const lng = typeof resolvedCountry?.lng === 'number' ? resolvedCountry.lng : NaN;
  
  // We explicitly override Asset from LLM with our deterministic Binance mapping string as a strong fallback,
  // or we keep the LLM asset string and pass the binance symbol down differently.
  // Actually, LLM "Asset" is usually a description (e.g. "European Equities" or "Oil Contracts").
  // Frontend charts expect a deterministic string if we want to query a live graph. We use assetMapper.
  const mappedBinanceAsset = mapCountryToBinanceSymbol(nlp.countryId);

  const signal: TradeSignal = {
    countryId: nlp.countryId,
    country: nlp.country,
    lat,
    lng,
    cause: ollamaRes.cause,
    impact: ollamaRes.impact,
    asset: mappedBinanceAsset, // Deterministic map overrules broad LLM sector names for the chart logic
    decision: ollamaRes.decision,
    confidence,
    timestamp: news.timestamp,
    source_headline: news.title
  };

  if (!isValidTradeSignal(signal)) {
    console.warn(`[PIPELINE] Skip: Generated signal was structurally invalid (missing coords/data)`);
    return null;
  }

  // Record to memory
  memoryEngine.addSignal(nlp.countryId, {
    sentiment: nlp.sentiment_score,
    confidence: signal.confidence,
    action: signal.decision, // store the LLM decision internally
    timestamp: signal.timestamp,
    topic: ollamaRes.impact,
  });

  console.log(`[PIPELINE] SIGNAL GENERATED -> (${signal.countryId}) Action: ${signal.decision.toUpperCase()}, Confidence: ${(signal.confidence * 100).toFixed(1)}%`);
  console.log(`--- [PIPELINE END] (${Date.now() - startMs}ms) ---\n`);

  return signal;
}
