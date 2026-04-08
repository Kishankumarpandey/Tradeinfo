// ---------------------------------------------------------------------------
// src/services/nlp.ts — Lightweight NLP processor (keyword-based)
// ---------------------------------------------------------------------------

import { resolveCountryRef } from './countryRegistry';

export interface NlpResult {
  country: string;          // legacy compatibility: detected country name or "Unknown"
  countryId: string | null;
  countryName: string;
  sentiment_score: number;  // -1.0 to +1.0
  topic: string;            // detected topic category
  impact_level: 'low' | 'medium' | 'high';
  matchedKeywords: {
    countries: string[];
    topics: string[];
    sentiment: Array<{ keyword: string; weight: number }>;
  };
  confidenceContribution: {
    sentiment: number;
    topic: number;
    country: number;
  };
}

// ── Country detection dictionary ────────────────────────────────────────────
const COUNTRY_KEYWORDS: { keywords: string[]; country: string }[] = [
  { keywords: ['united states', 'u.s.', 'us ', 'usa', 'american', 'washington', 'wall street', 'fed ', 'federal reserve', 'pentagon', 'white house'], country: 'United States' },
  { keywords: ['china', 'chinese', 'beijing', 'shanghai', 'xi jinping', 'pboc'],        country: 'China' },
  { keywords: ['japan', 'japanese', 'tokyo', 'yen ', 'boj '],                             country: 'Japan' },
  { keywords: ['germany', 'german', 'berlin', 'bundesbank', 'dax '],                     country: 'Germany' },
  { keywords: ['india', 'indian', 'delhi', 'mumbai', 'modi', 'rupee', 'rbi '],           country: 'India' },
  { keywords: ['uk ', 'u.k.', 'britain', 'british', 'london', 'england', 'boe '],        country: 'United Kingdom' },
  { keywords: ['france', 'french', 'paris', 'macron'],                                    country: 'France' },
  { keywords: ['brazil', 'brazilian', 'brasilia', 'sao paulo'],                            country: 'Brazil' },
  { keywords: ['canada', 'canadian', 'ottawa', 'toronto'],                                 country: 'Canada' },
  { keywords: ['south korea', 'korean', 'seoul'],                                          country: 'South Korea' },
  { keywords: ['australia', 'australian', 'sydney', 'canberra'],                            country: 'Australia' },
  { keywords: ['russia', 'russian', 'moscow', 'kremlin', 'putin'],                         country: 'Russia' },
  { keywords: ['mexico', 'mexican', 'mexico city'],                                        country: 'Mexico' },
  { keywords: ['indonesia', 'indonesian', 'jakarta'],                                      country: 'Indonesia' },
  { keywords: ['saudi', 'riyadh', 'opec'],                                                 country: 'Saudi Arabia' },
  { keywords: ['switzerland', 'swiss', 'zurich', 'geneva'],                                 country: 'Switzerland' },
  { keywords: ['turkey', 'turkish', 'ankara', 'istanbul', 'erdogan'],                      country: 'Turkey' },
  { keywords: ['netherlands', 'dutch', 'amsterdam', 'the hague'],                           country: 'Netherlands' },
  { keywords: ['taiwan', 'taiwanese', 'taipei', 'tsmc'],                                    country: 'Taiwan' },
  { keywords: ['sweden', 'swedish', 'stockholm'],                                           country: 'Sweden' },
  // Regions mapped to most relevant country
  { keywords: ['middle east', 'mideast'],                                                    country: 'Saudi Arabia' },
  { keywords: ['europe', 'european', 'eu ', 'eurozone', 'ecb'],                             country: 'Germany' },
  { keywords: ['asia', 'asian'],                                                             country: 'China' },
];

// ── Sentiment keywords ──────────────────────────────────────────────────────
const POSITIVE_KEYWORDS: { word: string; weight: number }[] = [
  { word: 'growth',         weight: 0.3 },
  { word: 'surge',          weight: 0.4 },
  { word: 'profit',         weight: 0.35 },
  { word: 'gain',           weight: 0.3 },
  { word: 'rally',          weight: 0.4 },
  { word: 'boom',           weight: 0.45 },
  { word: 'recovery',       weight: 0.35 },
  { word: 'agreement',      weight: 0.25 },
  { word: 'deal',           weight: 0.2 },
  { word: 'peace',          weight: 0.4 },
  { word: 'ceasefire',      weight: 0.35 },
  { word: 'innovation',     weight: 0.3 },
  { word: 'breakthrough',   weight: 0.35 },
  { word: 'investment',     weight: 0.25 },
  { word: 'record high',    weight: 0.45 },
  { word: 'optimism',       weight: 0.3 },
  { word: 'upgrade',        weight: 0.25 },
  { word: 'stimulus',       weight: 0.3 },
  { word: 'strong',         weight: 0.2 },
  { word: 'expand',         weight: 0.25 },
  { word: 'rise',           weight: 0.2 },
  { word: 'improve',        weight: 0.25 },
  { word: 'success',        weight: 0.3 },
  { word: 'soar',           weight: 0.4 },
  { word: 'robust',         weight: 0.25 },
];

const NEGATIVE_KEYWORDS: { word: string; weight: number }[] = [
  { word: 'war',            weight: -0.5 },
  { word: 'crisis',         weight: -0.45 },
  { word: 'crash',          weight: -0.5 },
  { word: 'decline',        weight: -0.3 },
  { word: 'recession',      weight: -0.45 },
  { word: 'conflict',       weight: -0.4 },
  { word: 'sanction',       weight: -0.35 },
  { word: 'tension',        weight: -0.3 },
  { word: 'attack',         weight: -0.45 },
  { word: 'bomb',           weight: -0.5 },
  { word: 'collapse',       weight: -0.5 },
  { word: 'inflation',      weight: -0.25 },
  { word: 'deficit',        weight: -0.2 },
  { word: 'disaster',       weight: -0.4 },
  { word: 'earthquake',     weight: -0.35 },
  { word: 'flood',          weight: -0.3 },
  { word: 'pandemic',       weight: -0.4 },
  { word: 'virus',          weight: -0.35 },
  { word: 'protest',        weight: -0.25 },
  { word: 'unrest',         weight: -0.3 },
  { word: 'threat',         weight: -0.25 },
  { word: 'risk',           weight: -0.15 },
  { word: 'shutdown',       weight: -0.3 },
  { word: 'tariff',         weight: -0.2 },
  { word: 'default',        weight: -0.45 },
  { word: 'fall',           weight: -0.2 },
  { word: 'drop',           weight: -0.25 },
  { word: 'plunge',         weight: -0.4 },
  { word: 'fear',           weight: -0.3 },
  { word: 'death',          weight: -0.35 },
  { word: 'killed',         weight: -0.35 },
  { word: 'missile',        weight: -0.45 },
  { word: 'invasion',       weight: -0.5 },
];

// ── Topic detection ─────────────────────────────────────────────────────────
const TOPIC_KEYWORDS: { keywords: string[]; topic: string }[] = [
  { keywords: ['interest rate', 'central bank', 'monetary', 'inflation', 'fed ', 'boj ', 'ecb', 'rbi ', 'rate hike', 'rate cut'], topic: 'monetary_policy' },
  { keywords: ['trade', 'tariff', 'export', 'import', 'trade deal', 'trade war', 'commerce'],                                      topic: 'trade' },
  { keywords: ['war', 'military', 'troops', 'army', 'missile', 'bomb', 'attack', 'invasion', 'defense', 'weapon', 'nato'],          topic: 'military' },
  { keywords: ['tech', 'semiconductor', 'chip', 'ai ', 'artificial intelligence', 'software', 'quantum', 'cyber', 'digital'],       topic: 'technology' },
  { keywords: ['oil', 'gas', 'energy', 'opec', 'renewable', 'solar', 'nuclear', 'coal', 'pipeline', 'fuel'],                        topic: 'energy' },
  { keywords: ['election', 'president', 'prime minister', 'parliament', 'government', 'political', 'vote', 'democracy', 'policy'],  topic: 'politics' },
  { keywords: ['earthquake', 'flood', 'hurricane', 'typhoon', 'tsunami', 'wildfire', 'drought', 'storm', 'disaster'],               topic: 'natural_disaster' },
  { keywords: ['covid', 'virus', 'pandemic', 'vaccine', 'health', 'hospital', 'disease', 'outbreak'],                                topic: 'healthcare' },
  { keywords: ['stock', 'market', 'index', 'trading', 'investor', 'shares', 'equity', 'bond', 'forex', 'currency'],                 topic: 'markets' },
  { keywords: ['gdp', 'economy', 'growth', 'recession', 'employment', 'jobs', 'unemployment', 'wage'],                              topic: 'economy' },
];

// ── Core NLP function ───────────────────────────────────────────────────────

/**
 * Analyze a news headline + description and extract structured intelligence.
 * Uses keyword matching and weighted scoring — no external API calls.
 */
export function analyzeText(text: string): NlpResult {
  const lowerText = ` ${text.toLowerCase()} `;

  // ── Detect country ────────────────────────────────────────────────────
  let country = 'Unknown';
  let countryScore = 0;
  const matchedCountryKeywords: string[] = [];
  for (const entry of COUNTRY_KEYWORDS) {
    let matchCount = 0;
    for (const kw of entry.keywords) {
      if (lowerText.includes(kw.toLowerCase())) {
        matchCount++;
        matchedCountryKeywords.push(kw);
      }
    }
    if (matchCount > countryScore) {
      countryScore = matchCount;
      country = entry.country;
    }
  }

  const resolvedCountry = resolveCountryRef(country);

  // ── Compute sentiment score ───────────────────────────────────────────
  let sentiment = 0;
  let matchedKeywords = 0;
  const matchedSentimentKeywords: Array<{ keyword: string; weight: number }> = [];

  for (const { word, weight } of POSITIVE_KEYWORDS) {
    if (lowerText.includes(word)) {
      sentiment += weight;
      matchedKeywords++;
      matchedSentimentKeywords.push({ keyword: word, weight });
    }
  }
  for (const { word, weight } of NEGATIVE_KEYWORDS) {
    if (lowerText.includes(word)) {
      sentiment += weight; // weight is already negative
      matchedKeywords++;
      matchedSentimentKeywords.push({ keyword: word, weight });
    }
  }

  // Normalize to -1..+1 range (diminishing returns for many matches)
  const rawSentiment = matchedKeywords > 0
    ? sentiment / Math.sqrt(matchedKeywords)
    : 0;
  const sentiment_score = Math.max(-1, Math.min(1, rawSentiment));

  // ── Detect topic ──────────────────────────────────────────────────────
  let topic = 'general';
  let topicScore = 0;
  const matchedTopicKeywords: string[] = [];
  for (const entry of TOPIC_KEYWORDS) {
    let matchCount = 0;
    for (const kw of entry.keywords) {
      if (lowerText.includes(kw.toLowerCase())) {
        matchCount++;
        matchedTopicKeywords.push(kw);
      }
    }
    if (matchCount > topicScore) {
      topicScore = matchCount;
      topic = entry.topic;
    }
  }

  // ── Determine impact level ────────────────────────────────────────────
  const absSentiment = Math.abs(sentiment_score);
  let impact_level: 'low' | 'medium' | 'high';
  if (absSentiment > 0.5 || topicScore >= 3) {
    impact_level = 'high';
  } else if (absSentiment > 0.2 || topicScore >= 2) {
    impact_level = 'medium';
  } else {
    impact_level = 'low';
  }

  // Boost impact for inherently high-impact topics
  if (['military', 'natural_disaster', 'healthcare'].includes(topic) && impact_level === 'low') {
    impact_level = 'medium';
  }

  const structured: NlpResult = {
    country: resolvedCountry?.name ?? country,
    countryId: resolvedCountry?.id ?? null,
    countryName: resolvedCountry?.name ?? country,
    sentiment_score: Math.round(sentiment_score * 1000) / 1000,
    topic,
    impact_level,
    matchedKeywords: {
      countries: matchedCountryKeywords.slice(0, 8),
      topics: matchedTopicKeywords.slice(0, 8),
      sentiment: matchedSentimentKeywords.slice(0, 10),
    },
    confidenceContribution: {
      sentiment: Math.round(Math.abs(sentiment_score) * 100) / 100,
      topic: Math.min(1, topicScore / 3),
      country: Math.min(1, countryScore / 3),
    },
  };

  return structured;
}

/**
 * Batch analyze multiple texts.
 */
export function analyzeMany(texts: string[]): NlpResult[] {
  return texts.map(analyzeText);
}
