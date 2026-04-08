import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { COUNTRIES, getPrimaryAssetForCountry, resolveCountry } from '../data/countries';
import { mapSignalsToCountries } from '../services/signalMapper';
import type {
  AttentionEvent,
  CountryRegistryItem,
  CountrySignal,
  HoveredCountryInfo,
  FocusTarget,
  InsightSeverity,
  LiveFeedItem,
  MapViewMode,
  SignalFlow,
  SearchResult,
  SignalInput,
  SignalAction,
  SignalBurst,
  SignalPriority,
} from '../types';

const DEFAULT_ASSETS = ['XAU/USD', 'EUR/USD', 'SPX', 'WTI'];
const ACTIVE_SIGNAL_TTL = 15 * 60 * 1000;
const SIGNAL_BATCH_MS = 300;

const ASSET_TARGET_ISO2: Array<{ pattern: RegExp; iso2: string }> = [
  { pattern: /(JPY|NIKKEI)/i, iso2: 'JP' },
  { pattern: /(CNH|CNY|CHINA)/i, iso2: 'CN' },
  { pattern: /(EUR|DAX)/i, iso2: 'DE' },
  { pattern: /(GBP|FTSE)/i, iso2: 'GB' },
  { pattern: /(AUD|ASX)/i, iso2: 'AU' },
  { pattern: /(WTI|BRENT|OIL)/i, iso2: 'SA' },
  { pattern: /(CAD)/i, iso2: 'CA' },
  { pattern: /(XAU|GOLD)/i, iso2: 'CH' },
  { pattern: /(SPX|USD|NYSE|NASDAQ)/i, iso2: 'US' },
];

function resolveTargetIso2FromAsset(asset?: string, sourceIso2?: string): string | null {
  if (!asset) return null;
  const match = ASSET_TARGET_ISO2.find((entry) => entry.pattern.test(asset));
  if (!match) return null;
  if (sourceIso2 && match.iso2 === sourceIso2) return null;
  return match.iso2;
}

interface GeoTradeContextType {
  countries: CountryRegistryItem[];
  selectedCountryIso2: string;
  selectedAsset: string;
  viewMode: MapViewMode;
  aiPanelOpen: boolean;
  focusTarget: FocusTarget | null;
  signalsByIso2: Map<string, CountrySignal>;
  countryIdToName: Map<string, string>;
  liveFeed: LiveFeedItem[];
  signalFlows: SignalFlow[];
  signalBursts: SignalBurst[];
  lastSignal: CountrySignal | null;
  attentionEvent: AttentionEvent | null;
  focusLockIso2: string | null;
  hoveredCountry: HoveredCountryInfo | null;
  setViewMode: (mode: MapViewMode) => void;
  selectCountryByIso2: (iso2: string, reason: string) => void;
  selectAsset: (asset: string) => void;
  applyRawSignals: (signals: SignalInput[]) => void;
  ingestNewsItem: (item: {
    id: string;
    headline: string;
    country: string;
    countryId: string;
    category: string;
    sentiment: string;
    impact_score: number;
    timestamp: number;
  }) => void;
  ingestInsightItem: (item: {
    id: string;
    message: string;
    severity: InsightSeverity;
    timestamp: number;
    relatedCountries: string[];
  }) => void;
  updateCountryIdNameMap: (entries: Array<{ id: string; name: string }>) => void;
  search: (query: string) => SearchResult[];
  selectSearchResult: (result: SearchResult) => void;
  setHoveredCountry: (info: HoveredCountryInfo | null) => void;
  clearFocusLock: () => void;
}

const GeoTradeContext = createContext<GeoTradeContextType | null>(null);

function signalPriority(confidence: number): SignalPriority {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.55) return 'medium';
  return 'low';
}

function toAttentionEvent(params: {
  iso2?: string;
  countryName?: string;
  action: SignalAction;
  confidence: number;
  source: AttentionEvent['source'];
  label: string;
  timestamp: number;
}): AttentionEvent {
  const priority = signalPriority(params.confidence);
  return {
    id: `attn-${params.iso2 ?? 'global'}-${params.timestamp}`,
    iso2: params.iso2,
    countryName: params.countryName,
    action: params.action,
    confidence: params.confidence,
    priority,
    source: params.source,
    timestamp: params.timestamp,
    label: params.label,
  };
}

export function GeoTradeProvider({ children }: PropsWithChildren) {
  const [selectedCountryIso2, setSelectedCountryIso2] = useState('US');
  const [selectedAsset, setSelectedAsset] = useState('');
  const [viewMode, setViewMode] = useState<MapViewMode>('earth');
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [signalsByIso2, setSignalsByIso2] = useState<Map<string, CountrySignal>>(new Map());
  const [countryIdToName, setCountryIdToName] = useState<Map<string, string>>(new Map());
  const [liveFeed, setLiveFeed] = useState<LiveFeedItem[]>([]);
  const [signalFlows, setSignalFlows] = useState<SignalFlow[]>([]);
  const [signalBursts, setSignalBursts] = useState<SignalBurst[]>([]);
  const [lastSignal, setLastSignal] = useState<CountrySignal | null>(null);
  const [attentionEvent, setAttentionEvent] = useState<AttentionEvent | null>(null);
  const [focusLockIso2, setFocusLockIso2] = useState<string | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<HoveredCountryInfo | null>(null);
  const pendingSignalsRef = useRef<SignalInput[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const selectedCountry = resolveCountry(selectedCountryIso2);
    if (selectedCountry && !selectedAsset) {
      setSelectedAsset(getPrimaryAssetForCountry(selectedCountry));
    }
  }, [selectedAsset, selectedCountryIso2]);

  const selectCountryByIso2 = useCallback((iso2: string, reason: string) => {
    const country = resolveCountry(iso2);
    if (!country) return;

    console.info('[country-select]', { reason, country: country.name, iso2: country.iso2 });
    setSelectedCountryIso2(country.iso2);
    setFocusTarget({
      iso2: country.iso2,
      lat: country.lat,
      lng: country.lng,
      ts: Date.now(),
    });
    setFocusLockIso2(country.iso2);
    setAttentionEvent(
      toAttentionEvent({
        iso2: country.iso2,
        countryName: country.name,
        action: 'hold',
        confidence: 0.56,
        source: 'selection',
        label: `FOCUS LOCK - ${country.name.toUpperCase()}`,
        timestamp: Date.now(),
      }),
    );

    setSelectedAsset((current) => (country.assets?.includes(current) ? current : getPrimaryAssetForCountry(country)));
    setAiPanelOpen(true);
  }, []);

  const clearFocusLock = useCallback(() => {
    setFocusLockIso2(null);
  }, []);

  const processSignals = useCallback(
    (signals: SignalInput[]) => {
      console.info('SIGNAL APPLIED', { count: signals.length, sample: signals.slice(0, 1) });
      const mapped = mapSignalsToCountries(signals, countryIdToName);
      const now = Date.now();
      const latestIncoming = mapped
        .slice()
        .sort((a, b) => (b.updatedAt ?? now) - (a.updatedAt ?? now))[0];

      if (latestIncoming) {
        setLastSignal((prev) => {
          if (!prev) return latestIncoming;
          return (latestIncoming.updatedAt ?? now) >= (prev.updatedAt ?? 0) ? latestIncoming : prev;
        });
      }

      setSignalsByIso2((prev) => {
        const next = new Map(prev);
        for (const signal of mapped) {
          const existing = next.get(signal.iso2);
          const existingAge = existing?.updatedAt ? now - existing.updatedAt : Number.POSITIVE_INFINITY;
          const incomingAge = signal.updatedAt ? now - signal.updatedAt : 0;
          if (!existing || incomingAge <= existingAge || signal.confidence >= existing.confidence) {
            next.set(signal.iso2, signal);
          }
        }

        for (const [iso2, signal] of [...next.entries()]) {
          if (signal.updatedAt && now - signal.updatedAt > ACTIVE_SIGNAL_TTL) {
            next.delete(iso2);
          }
        }

        console.info('[state] signalsByIso2 updated', { activeCountries: next.size, keys: [...next.keys()] });
        return next;
      });

      setSignalFlows((prev) => {
        const next = [...prev];
        for (const signal of mapped) {
          const country = resolveCountry(signal.iso2);
          if (!country) continue;
          const targetIso2 = resolveTargetIso2FromAsset(signal.asset, signal.iso2);
          if (!targetIso2) {
            continue;
          }
          next.unshift({
            sourceIso2: signal.iso2,
            targetIso2,
            action: signal.action,
            confidence: signal.confidence,
            timestamp: signal.updatedAt ?? now,
          });
        }
        return next
          .filter((flow) => flow.sourceIso2 !== flow.targetIso2)
          .slice(0, 24);
      });

      setLiveFeed((prev) => {
        const next = [...prev];
        for (const signal of mapped) {
          next.unshift({
            id: `sig-${signal.iso2}-${signal.updatedAt ?? now}`,
            kind: 'signal' as const,
            title: `${signal.countryName} ${signal.action.toUpperCase()} ${signal.confidence >= 0.75 ? 'HIGH CONVICTION' : 'LIVE SIGNAL'}`,
            country: signal.countryName,
            iso2: signal.iso2,
            action: signal.action,
            confidence: signal.confidence,
            sentimentScore: signal.sentimentScore,
            sentimentLabel: signal.sentimentLabel,
            topic: signal.topic,
            reason: signal.reason,
            explanationSummary: signal.explanationSummary,
            headline: signal.sourceHeadline,
            timestamp: signal.updatedAt ?? now,
          });
        }
        console.info('[state] liveFeed appended signals', { items: mapped.length, total: next.length });
        return next.slice(0, 40);
      });

      setSignalBursts((prev) => {
        const burstEvents = mapped.map((signal) => ({
          id: `burst-${signal.iso2}-${signal.updatedAt ?? now}`,
          iso2: signal.iso2,
          action: signal.action,
          confidence: signal.confidence,
          timestamp: signal.updatedAt ?? now,
        }));
        const next = [...burstEvents, ...prev].slice(0, 36);
        return next.filter((item) => now - item.timestamp < 12_000);
      });

      const attentionSignals = focusLockIso2
        ? mapped.filter((signal) => signal.iso2 === focusLockIso2)
        : mapped;
      const dominantSignal = attentionSignals.sort((a, b) => (b.updatedAt ?? now) - (a.updatedAt ?? now))[0];
      if (dominantSignal) {
        const country = resolveCountry(dominantSignal.iso2);
        if (country) {
          setFocusTarget({
            iso2: country.iso2,
            lat: country.lat,
            lng: country.lng,
            ts: now,
          });
        }
        setAttentionEvent(
          toAttentionEvent({
            iso2: dominantSignal.iso2,
            countryName: dominantSignal.countryName,
            action: dominantSignal.action,
            confidence: dominantSignal.confidence,
            source: 'signal',
            label: `${signalPriority(dominantSignal.confidence).toUpperCase()} IMPACT EVENT - ${dominantSignal.countryName.toUpperCase()}`,
            timestamp: dominantSignal.updatedAt ?? now,
          }),
        );
        setAiPanelOpen(true);
      }

      console.info('UI UPDATED', {
        activeSignals: mapped.length,
        activeCountries: mapped.map((item) => item.iso2),
      });
    },
    [countryIdToName, focusLockIso2],
  );

  const applyRawSignals = useCallback((signals: SignalInput[]) => {
    if (signals.length === 0) return;
    pendingSignalsRef.current = [...pendingSignalsRef.current, ...signals];

    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = window.setTimeout(() => {
      const queued = pendingSignalsRef.current;
      pendingSignalsRef.current = [];
      flushTimerRef.current = null;
      processSignals(queued);
    }, SIGNAL_BATCH_MS);
  }, [processSignals]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
    };
  }, []);

  const ingestNewsItem = useCallback((item: {
    id: string;
    headline: string;
    country: string;
    countryId: string;
    category: string;
    sentiment: string;
    impact_score: number;
    timestamp: number;
  }) => {
    const resolved = resolveCountry(item.country) ?? resolveCountry(countryIdToName.get(item.countryId));
    console.info('[state] news received', { id: item.id, country: item.country, resolved: resolved?.iso2 });
    setLiveFeed((prev) => [{
      id: `news-${item.id}`,
      kind: 'news' as const,
      title: item.headline,
      country: resolved?.name ?? item.country,
      iso2: resolved?.iso2,
      confidence: Math.min(1, item.impact_score / 100),
      reason: `${item.category} | ${item.sentiment}`,
      explanationSummary: `${item.category.replace(/_/g, ' ')} event from ${resolved?.name ?? item.country}`,
      headline: item.headline,
      timestamp: item.timestamp,
    }, ...prev].slice(0, 40));
  }, [countryIdToName]);

  const ingestInsightItem = useCallback((item: {
    id: string;
    message: string;
    severity: InsightSeverity;
    timestamp: number;
    relatedCountries: string[];
  }) => {
    console.info('[state] insight received', item);
    setLiveFeed((prev) => [{
      id: `ins-${item.id}`,
      kind: 'insight' as const,
      title: item.message,
      severity: item.severity,
      relatedCountries: item.relatedCountries,
      explanationSummary: item.message,
      timestamp: item.timestamp,
    }, ...prev].slice(0, 40));

    if (item.severity === 'critical' || item.severity === 'high') {
      const relatedCountry = item.relatedCountries[0] ? resolveCountry(item.relatedCountries[0]) : undefined;
      setAttentionEvent(
        toAttentionEvent({
          iso2: relatedCountry?.iso2,
          countryName: relatedCountry?.name,
          action: 'hold',
          confidence: item.severity === 'critical' ? 0.92 : 0.72,
          source: 'insight',
          label: `${item.severity.toUpperCase()} ALERT${relatedCountry ? ` - ${relatedCountry.name.toUpperCase()}` : ''}`,
          timestamp: item.timestamp,
        }),
      );
      if (relatedCountry) {
        setFocusTarget({
          iso2: relatedCountry.iso2,
          lat: relatedCountry.lat,
          lng: relatedCountry.lng,
          ts: item.timestamp,
        });
      }
      setAiPanelOpen(true);
    }
  }, []);

  const updateCountryIdNameMap = useCallback((entries: Array<{ id: string; name: string }>) => {
    if (entries.length === 0) return;
    console.info('[state] countryIdNameMap update', { count: entries.length, sample: entries.slice(0, 3) });
    setCountryIdToName((prev) => {
      const next = new Map(prev);
      for (const entry of entries) {
        if (entry.id && entry.name) {
          next.set(entry.id, entry.name);
        }
      }
      return next;
    });
  }, []);

  const search = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      if (!q) return [];

      const countriesFound = COUNTRIES.filter((country) => {
        return (
          country.name.toLowerCase().includes(q) ||
          country.iso2.toLowerCase().includes(q) ||
          country.iso3.toLowerCase().includes(q)
        );
      })
        .slice(0, 10)
        .map((country) => ({
          id: `country-${country.iso2}`,
          label: `${country.name} (${country.iso2})`,
          type: 'country' as const,
          iso2: country.iso2,
        }));

      const assets = new Set<string>(DEFAULT_ASSETS);
      for (const country of COUNTRIES) {
        for (const asset of country.assets ?? []) {
          assets.add(asset);
        }
      }

      const assetsFound = [...assets]
        .filter((asset) => asset.toLowerCase().includes(q))
        .slice(0, 8)
        .map((asset) => ({
          id: `asset-${asset}`,
          label: asset,
          type: 'asset' as const,
          asset,
        }));

      return [...countriesFound, ...assetsFound];
    },
    [],
  );

  const selectSearchResult = useCallback(
    (result: SearchResult) => {
      console.info('[search-select]', result);
      if (result.type === 'country' && result.iso2) {
        selectCountryByIso2(result.iso2, 'search');
      }
      if (result.type === 'asset' && result.asset) {
        setSelectedAsset(result.asset);
      }
      setAiPanelOpen(true);
    },
    [selectCountryByIso2],
  );

  const activeSignalCount = signalsByIso2.size;

  const contextValue = useMemo<GeoTradeContextType>(
    () => ({
      countries: COUNTRIES,
      selectedCountryIso2,
      selectedAsset,
      viewMode,
      aiPanelOpen,
      focusTarget,
      signalsByIso2,
      countryIdToName,
      liveFeed,
      signalFlows,
      signalBursts,
      lastSignal,
      attentionEvent,
      focusLockIso2,
      hoveredCountry,
      setViewMode,
      selectCountryByIso2,
      selectAsset: setSelectedAsset,
      applyRawSignals,
      ingestNewsItem,
      ingestInsightItem,
      updateCountryIdNameMap,
      search,
      selectSearchResult,
      setHoveredCountry,
      clearFocusLock,
    }),
    [
      aiPanelOpen,
      attentionEvent,
      applyRawSignals,
      clearFocusLock,
      hoveredCountry,
      ingestInsightItem,
      ingestNewsItem,
      countryIdToName,
      focusTarget,
      search,
      selectCountryByIso2,
      selectSearchResult,
      selectedAsset,
      selectedCountryIso2,
      signalsByIso2,
      liveFeed,
      signalFlows,
      signalBursts,
      lastSignal,
      focusLockIso2,
      viewMode,
      updateCountryIdNameMap,
    ],
  );

  return <GeoTradeContext.Provider value={contextValue}>{children}</GeoTradeContext.Provider>;
}

export function useGeoTradeState() {
  const ctx = useContext(GeoTradeContext);
  if (!ctx) {
    throw new Error('useGeoTradeState must be used within GeoTradeProvider');
  }
  return ctx;
}
