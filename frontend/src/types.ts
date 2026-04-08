export type SignalAction = 'buy' | 'sell' | 'hold' | 'strong_buy' | 'strong_sell';
export type MapViewMode = 'earth' | 'map2d' | 'chart';
export type SignalTone = 'bullish' | 'bearish' | 'neutral';
export type FeedKind = 'signal' | 'news' | 'insight';
export type InsightSeverity = 'low' | 'medium' | 'high' | 'critical';
export type SignalPriority = 'high' | 'medium' | 'low';

export interface SignalInput {
  country?: string;
  countryId?: string;
  lat?: number;
  lng?: number;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
  action?: string;
  decision?: string; // from Ollama LLM
  asset?: string;
  confidence?: number;
  reason?: string;
  cause?: string;    // from Ollama LLM
  impact?: string;   // from Ollama LLM
  explanation?: {
    summary?: string;
    factors?: Array<{ type: 'sentiment' | 'trend' | 'event'; impact: number }>;
  };
  sentiment_score?: number;
  topic?: string;
  source_headline?: string;
  strength?: 'weak' | 'moderate' | 'strong';
  score?: number;
  trend?: SignalTone;
  trend_strength?: number;
  timestamp?: number;
}

export interface CountryRegistryItem {
  name: string;
  iso2: string;
  iso3: string;
  isoNumeric: string;
  lat: number;
  lng: number;
  region: string;
  assets?: string[];
}

export interface CountrySignal {
  iso2: string;
  countryName: string;
  lat?: number;
  lng?: number;
  action: SignalAction;
  confidence: number;
  strength?: 'weak' | 'moderate' | 'strong';
  asset?: string;
  source?: string;
  reason?: string;
  sourceHeadline?: string;
  topic?: string;
  sentimentScore?: number;
  sentimentLabel?: SignalTone;
  score?: number;
  trend?: SignalTone;
  trendStrength?: number;
  explanationSummary?: string;
  explanationFactors?: Array<{ type: 'sentiment' | 'trend' | 'event'; impact: number }>;
  updatedAt?: number;
}

export interface FocusTarget {
  iso2: string;
  lat: number;
  lng: number;
  ts: number;
}

export interface SearchResult {
  id: string;
  label: string;
  type: 'country' | 'asset';
  iso2?: string;
  asset?: string;
}

export interface LiveFeedItem {
  id: string;
  kind: FeedKind;
  title: string;
  country?: string;
  iso2?: string;
  action?: SignalAction;
  confidence?: number;
  sentimentScore?: number;
  sentimentLabel?: SignalTone;
  topic?: string;
  reason?: string;
  explanationSummary?: string;
  headline?: string;
  severity?: InsightSeverity;
  relatedCountries?: string[];
  timestamp: number;
}

export interface SignalFlow {
  sourceIso2: string;
  targetIso2: string;
  action: SignalAction;
  confidence: number;
  timestamp: number;
}

export interface SignalBurst {
  id: string;
  iso2: string;
  action: SignalAction;
  confidence: number;
  timestamp: number;
}

export interface AttentionEvent {
  id: string;
  iso2?: string;
  countryName?: string;
  action: SignalAction;
  confidence: number;
  priority: SignalPriority;
  source: 'signal' | 'insight' | 'selection';
  timestamp: number;
  label: string;
}

export interface HoveredCountryInfo {
  iso2: string;
  title: string;
  countryName: string;
  action: SignalAction;
  confidence: number;
  sentimentLabel: SignalTone;
  topic?: string;
  reason?: string;
  explanationSummary?: string;
}
