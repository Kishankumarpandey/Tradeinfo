// ---------------------------------------------------------------------------
// SYSTEM 1 + 3 + 6: Reasoning Chain, Holy Moment, Demo Flow state
// ---------------------------------------------------------------------------
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { ReasoningChain, DemoScenario } from './demoScenarios';
import { DEMO_SCENARIOS } from './demoScenarios';
import { useGeoTradeState } from '../state/GeoTradeState';
import { resolveCountry } from '../data/countries';

// ── Active chain state ────────────────────────────────────────────────────
export interface ActiveChain {
  chain: ReasoningChain;
  originIso2: string;
  originName: string;
  headline: string;
  signalColor: string; // '#00FF9C' | '#FF4466' | '#FFB800'
  step: number; // 0-5, which field is currently revealed
  complete: boolean;
}

export interface AlertBanner {
  id: string;
  headline: string;
  asset: string;
  direction: string;
  confidence: number;
  startedAt: number;
}

interface DemoSystemContextType {
  // Demo Mode (System 6)
  demoMode: boolean;
  toggleDemoMode: () => void;
  demoStep: number;
  advanceDemoStep: () => void;

  // Active scenario
  activeScenario: DemoScenario | null;
  fireScenario: (id: string) => void;

  // Reasoning Chain (System 1)
  activeChain: ActiveChain | null;
  clearChain: () => void;

  // Holy Moment (System 3)
  holyMomentActive: boolean;

  // Alert Banner (System 4)
  alertBanner: AlertBanner | null;
  dismissBanner: () => void;

  // Demo control panel visibility
  showDemoPanel: boolean;
  setShowDemoPanel: (v: boolean) => void;
}

const DemoSystemContext = createContext<DemoSystemContextType | null>(null);

// Chain field labels in order
const CHAIN_FIELDS: (keyof ReasoningChain)[] = ['event', 'impact', 'historical', 'asset', 'action', 'confidence'];

export function DemoSystemProvider({ children }: { children: React.ReactNode }) {
  const { applyRawSignals, selectCountryByIso2 } = useGeoTradeState();

  const [demoMode, setDemoMode] = useState(false);
  const [demoStep, setDemoStep] = useState(0);
  const [activeScenario, setActiveScenario] = useState<DemoScenario | null>(null);
  const [activeChain, setActiveChain] = useState<ActiveChain | null>(null);
  const [holyMomentActive, setHolyMomentActive] = useState(false);
  const [alertBanner, setAlertBanner] = useState<AlertBanner | null>(null);
  const [showDemoPanel, setShowDemoPanel] = useState(false);
  const chainTimerRef = useRef<number | null>(null);
  const bannerTimerRef = useRef<number | null>(null);
  const returnTimerRef = useRef<number | null>(null);

  // Keyboard shortcut: Shift+D toggles demo mode, Ctrl+Shift+P toggles demo panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'D') {
        setDemoMode(prev => !prev);
        setDemoStep(0);
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        setShowDemoPanel(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleDemoMode = useCallback(() => {
    setDemoMode(prev => {
      if (prev) {
        // Exiting demo mode
        setDemoStep(0);
        setActiveScenario(null);
        clearTimers();
      }
      return !prev;
    });
  }, []);

  const advanceDemoStep = useCallback(() => {
    setDemoStep(prev => prev + 1);
  }, []);

  function clearTimers() {
    if (chainTimerRef.current) window.clearInterval(chainTimerRef.current);
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    if (returnTimerRef.current) window.clearTimeout(returnTimerRef.current);
  }

  const clearChain = useCallback(() => {
    setActiveChain(null);
    setHolyMomentActive(false);
    if (chainTimerRef.current) window.clearInterval(chainTimerRef.current);
  }, []);

  const dismissBanner = useCallback(() => {
    setAlertBanner(null);
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
  }, []);

  const getSignalColor = (action: string): string => {
    if (action.includes('buy')) return '#00FF9C';
    if (action.includes('sell')) return '#FF4466';
    return '#FFB800';
  };

  const fireScenario = useCallback((id: string) => {
    const scenario = DEMO_SCENARIOS.find(s => s.id === id);
    if (!scenario) return;

    clearTimers();
    setActiveScenario(scenario);

    // ── HOLY MOMENT SEQUENCE (System 3) ──────────────────────────────────

    // Step 0 (0ms): Globe Pulse — focus on origin country
    setHolyMomentActive(true);
    const country = resolveCountry(scenario.originCountryIso2);
    if (country) {
      selectCountryByIso2(scenario.originCountryIso2, 'demo-scenario');
    }

    // Initialize chain with step 0 (nothing revealed yet)
    setActiveChain({
      chain: scenario.chain,
      originIso2: scenario.originCountryIso2,
      originName: scenario.originCountryName,
      headline: scenario.headline,
      signalColor: getSignalColor(scenario.signalAction),
      step: 0,
      complete: false,
    });

    // Step 1 (800ms): Signal card fires — inject into state
    setTimeout(() => {
      applyRawSignals([{
        country: scenario.originCountryIso2,
        countryId: scenario.originCountryIso2,
        lat: country?.lat,
        lng: country?.lng,
        sentiment: scenario.signalAction.includes('buy') ? 'bullish' : scenario.signalAction.includes('sell') ? 'bearish' : 'neutral',
        action: scenario.signalAction,
        asset: scenario.signalAsset,
        confidence: scenario.signalConfidence,
        reason: scenario.chain.event,
        explanation: { summary: scenario.chain.impact, factors: [{ type: 'event', impact: scenario.signalConfidence }] },
        sentiment_score: scenario.signalAction.includes('buy') ? 0.7 : -0.7,
        topic: scenario.label.toLowerCase().replace(/\s+/g, '_'),
        source_headline: scenario.headline,
        timestamp: Date.now(),
      }]);
    }, 800);

    // Step 2 (1000ms): AI Panel activation — start rendering chain field-by-field
    let chainStep = 0;
    setTimeout(() => {
      chainTimerRef.current = window.setInterval(() => {
        chainStep++;
        if (chainStep > CHAIN_FIELDS.length) {
          if (chainTimerRef.current) window.clearInterval(chainTimerRef.current);
          setActiveChain(prev => prev ? { ...prev, step: CHAIN_FIELDS.length, complete: true } : null);
          // End holy moment after chain completes
          setTimeout(() => setHolyMomentActive(false), 600);
          return;
        }
        setActiveChain(prev => prev ? { ...prev, step: chainStep } : null);
      }, 350);
    }, 1000);

    // Step 3 (1200ms): Alert banner drops
    setTimeout(() => {
      setAlertBanner({
        id: `alert-${scenario.id}-${Date.now()}`,
        headline: scenario.headline,
        asset: scenario.signalAsset,
        direction: scenario.signalAction.includes('buy') ? '↑ BUY' : scenario.signalAction.includes('sell') ? '↓ SELL' : '— HOLD',
        confidence: scenario.signalConfidence,
        startedAt: Date.now(),
      });
      // Auto-dismiss after 12s
      bannerTimerRef.current = window.setTimeout(() => {
        setAlertBanner(null);
      }, 12000);
    }, 1200);

    // Return to live mode after 90s (if not in demo mode)
    if (!demoMode) {
      returnTimerRef.current = window.setTimeout(() => {
        setActiveScenario(null);
        setHolyMomentActive(false);
      }, 90000);
    }
  }, [applyRawSignals, demoMode, selectCountryByIso2]);

  // Method for live signals to also trigger chains
  useEffect(() => {
    // Cleanup on unmount
    return () => clearTimers();
  }, []);

  const value: DemoSystemContextType = {
    demoMode,
    toggleDemoMode,
    demoStep,
    advanceDemoStep,
    activeScenario,
    fireScenario,
    activeChain,
    clearChain,
    holyMomentActive,
    alertBanner,
    dismissBanner,
    showDemoPanel,
    setShowDemoPanel,
  };

  return <DemoSystemContext.Provider value={value}>{children}</DemoSystemContext.Provider>;
}

export function useDemoSystem() {
  const ctx = useContext(DemoSystemContext);
  if (!ctx) throw new Error('useDemoSystem must be used within DemoSystemProvider');
  return ctx;
}
