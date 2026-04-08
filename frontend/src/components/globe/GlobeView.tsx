import { useEffect, useMemo, useRef, useState } from 'react';
import Globe from 'globe.gl';
import * as THREE from 'three';
import { COUNTRY_BY_NUMERIC, COUNTRIES } from '../../data/countries';
import { getWorldCountryFeatures } from '../../data/worldGeometry';
import { signalActionLabel, signalColor } from '../../services/signalMapper';
import { useGeoTradeState } from '../../state/GeoTradeState';
import { randomInterval } from '../../systems/ambientEngine';

const MAX_ARCS = 20;
const MIN_ARC_CONFIDENCE = 0.4;
const MAX_ARC_AGE_MS = 15 * 60 * 1000;

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isValidLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180;
}

function getArcColor(confidence: number): string {
  if (confidence > 0.7) return 'rgba(255,120,120,0.7)';
  if (confidence > 0.5) return 'rgba(255,200,120,0.6)';
  return 'rgba(120,200,255,0.5)';
}

function arcActionColor(action: string, confidence: number): string {
  const alpha = confidence > 0.75 ? 0.78 : confidence > 0.55 ? 0.62 : 0.48;
  if (action.includes('sell')) return `rgba(214, 76, 76, ${alpha})`;
  if (action.includes('buy')) return `rgba(27, 187, 97, ${alpha})`;
  return getArcColor(confidence);
}

export function GlobeView() {
  const {
    selectedCountryIso2,
    selectCountryByIso2,
    signalsByIso2,
    focusTarget,
    signalFlows,
    liveFeed,
    signalBursts,
    setHoveredCountry,
    attentionEvent,
    focusLockIso2,
  } = useGeoTradeState();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<any>(null);
  const signalsRef = useRef(signalsByIso2);
  const hoverSetterRef = useRef(setHoveredCountry);
  const selectCountryRef = useRef(selectCountryByIso2);
  const globeUpdateTimerRef = useRef<number | null>(null);

  const featuresRef = useRef(getWorldCountryFeatures());
  const countriesByIso2 = useMemo(() => {
    const next = new Map<string, any>();
    for (const country of COUNTRY_BY_NUMERIC.values()) {
      next.set(country.iso2, country);
    }
    return next;
  }, []);

  useEffect(() => {
    signalsRef.current = signalsByIso2;
  }, [signalsByIso2]);

  useEffect(() => {
    hoverSetterRef.current = setHoveredCountry;
  }, [setHoveredCountry]);

  useEffect(() => {
    selectCountryRef.current = selectCountryByIso2;
  }, [selectCountryByIso2]);

  const rawArcs = useMemo(() => {
    return signalFlows.slice(0, 100).map((flow) => {
      const source = countriesByIso2.get(flow.sourceIso2);
      const target = countriesByIso2.get(flow.targetIso2);
      const confidence = safeNumber(flow.confidence, 0);
      const ageMs = Date.now() - safeNumber(flow.timestamp, Date.now());
      return {
        startLat: safeNumber(source?.lat, NaN),
        startLng: safeNumber(source?.lng, NaN),
        endLat: safeNumber(target?.lat, NaN),
        endLng: safeNumber(target?.lng, NaN),
        action: flow.action,
        confidence,
        stroke: confidence > 0.8 ? 0.8 : confidence > 0.6 ? 0.5 : 0.3,
        altitude: confidence * 0.28 + 0.12,
        speed: ageMs <= 12_000 ? 1500 : 0,
        dashLength: safeNumber(flow.confidence, 0) >= 0.8 ? 0.62 : 0.42,
        dashGap: safeNumber(flow.confidence, 0) >= 0.8 ? 0.48 : 0.72,
        isNew: ageMs <= 12_000,
        ageMs,
      };
    });
  }, [countriesByIso2, signalFlows]);

  const filteredArcs = useMemo(() => {
    const filtered = rawArcs
      .filter(isValidArc)
      .filter((arc) => arc.ageMs <= MAX_ARC_AGE_MS)
      .filter((arc) => arc.confidence > MIN_ARC_CONFIDENCE)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_ARCS);
    return filtered;
  }, [rawArcs]);

  // ── System D: Ambient micro-arcs ─────────────────────────────────────
  const [ambientArcs, setAmbientArcs] = useState<any[]>([]);
  const [ambientRings, setAmbientRings] = useState<any[]>([]);
  const ambientArcTimer = useRef<number | null>(null);
  const ambientRingTimer = useRef<number | null>(null);
  const ambientGlowTimer = useRef<number | null>(null);
  const [glowIso2, setGlowIso2] = useState<string | null>(null);

  // Valid countries for ambient activity
  const validCountries = useMemo(() => {
    return COUNTRIES.filter(c => isValidLatLng(c.lat, c.lng));
  }, []);

  // Micro-arcs: faint arcs between random countries every 8-12s
  useEffect(() => {
    function scheduleArc() {
      ambientArcTimer.current = window.setTimeout(() => {
        if (validCountries.length < 2) return;
        const src = validCountries[Math.floor(Math.random() * validCountries.length)];
        let tgt = src;
        while (tgt.iso2 === src.iso2) {
          tgt = validCountries[Math.floor(Math.random() * validCountries.length)];
        }
        const arc = {
          startLat: src.lat, startLng: src.lng,
          endLat: tgt.lat, endLng: tgt.lng,
          action: 'hold', confidence: 0.15,
          stroke: 0.2, altitude: 0.12,
          speed: 2000, dashLength: 0.5, dashGap: 0.8,
          isNew: true, ageMs: 0,
        };
        setAmbientArcs([arc]);
        // Clear after 2s so it fades
        setTimeout(() => setAmbientArcs([]), 2000);
        scheduleArc();
      }, randomInterval(8000, 12000));
    }
    scheduleArc();
    return () => { if (ambientArcTimer.current) clearTimeout(ambientArcTimer.current); };
  }, [validCountries]);

  // Country glow cycle: random country briefly brightens every 20-30s
  useEffect(() => {
    function scheduleGlow() {
      ambientGlowTimer.current = window.setTimeout(() => {
        if (validCountries.length === 0) return;
        const c = validCountries[Math.floor(Math.random() * validCountries.length)];
        setGlowIso2(c.iso2);
        setTimeout(() => setGlowIso2(null), 1500);
        scheduleGlow();
      }, randomInterval(20000, 30000));
    }
    scheduleGlow();
    return () => { if (ambientGlowTimer.current) clearTimeout(ambientGlowTimer.current); };
  }, [validCountries]);

  // Scan ring: large faint ring from equator every 45s
  useEffect(() => {
    function scheduleScan() {
      ambientRingTimer.current = window.setTimeout(() => {
        setAmbientRings([{
          lat: 0, lng: 20,
          color: 'rgba(0, 240, 255, 0.08)',
          maxRadius: 30,
          speed: 1.5,
          repeat: 0,
        }]);
        setTimeout(() => setAmbientRings([]), 6000);
        scheduleScan();
      }, 45000);
    }
    scheduleScan();
    return () => { if (ambientRingTimer.current) clearTimeout(ambientRingTimer.current); };
  }, []);

  // Merge real arcs with ambient arcs
  const stableArcs = useMemo(() => {
    // During holy moment or real activity, suppress ambient arcs
    if (filteredArcs.length > 3) return filteredArcs;
    return [...filteredArcs, ...ambientArcs];
  }, [filteredArcs, ambientArcs]);

  const cleanMode = stableArcs.length < 5;

  useEffect(() => {
    if (!containerRef.current || globeRef.current) return;

    try {
      const globe = new (Globe as any)(containerRef.current)
        .backgroundColor('rgba(7, 15, 28, 0)')
        .showAtmosphere(true)
        .atmosphereColor('#58abff')
        .atmosphereAltitude(0.18)
        .polygonCapCurvatureResolution(6)
        .polygonsData(featuresRef.current)
        .polygonSideColor(() => 'rgba(22, 32, 50, 0.35)')
        .polygonStrokeColor(() => 'rgba(255,255,255,0.24)')
        .onPolygonHover((polygon: any) => {
          if (!polygon) {
            hoverSetterRef.current(null);
            return;
          }

          const numeric = String(polygon?.properties?.id ?? '');
          const country = COUNTRY_BY_NUMERIC.get(numeric);
          if (!country) {
            hoverSetterRef.current(null);
            return;
          }

          if (!isValidLatLng(country.lat, country.lng)) {
            console.warn('INVALID SIGNAL SKIPPED:', { iso2: country.iso2, lat: country.lat, lng: country.lng });
            hoverSetterRef.current(null);
            return;
          }

          const signal = signalsRef.current.get(country.iso2);
          hoverSetterRef.current({
            iso2: country.iso2,
            title: country.name,
            countryName: country.name,
            action: signal?.action ?? 'hold',
            confidence: signal?.confidence ?? 0,
            sentimentLabel: signal?.sentimentLabel ?? 'neutral',
            topic: signal?.topic,
            reason: signal?.reason,
          });
        })
        .onPolygonClick((polygon: any) => {
          const numeric = String(polygon?.properties?.id ?? '');
          const country = COUNTRY_BY_NUMERIC.get(numeric);
          if (!country) return;
          console.info('[globe-click]', { country: country.name, iso2: country.iso2 });
          selectCountryRef.current(country.iso2, 'globe-click');
        });

      globe.pointOfView({ lat: 18, lng: 76, altitude: 2.1 }, 0);

      const controls = globe.controls();
      controls.autoRotate = false;
      controls.autoRotateSpeed = 0;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;

      const scene = globe.scene();
      scene.add(new THREE.AmbientLight(0xffffff, 0.8));
      const directional = new THREE.DirectionalLight(0xffffff, 0.9);
      directional.position.set(-200, 200, 300);
      scene.add(directional);

      globe
        .pointsData([])
        .pointLat((point: any) => point.lat)
        .pointLng((point: any) => point.lng)
        .pointColor((point: any) => point.color)
        .pointRadius((point: any) => point.radius)
        .pointAltitude((point: any) => point.altitude)
        .pointLabel((point: any) => point.label)
        .ringsData([])
        .ringLat((ring: any) => ring.lat)
        .ringLng((ring: any) => ring.lng)
        .ringColor((ring: any) => () => ring.color)
        .ringMaxRadius((ring: any) => ring.maxRadius)
        .ringPropagationSpeed((ring: any) => ring.speed)
        .ringRepeatPeriod((ring: any) => ring.repeat);

      globeRef.current = globe;
      console.info('GLOBE INITIALIZED ONCE');
    } catch (error) {
      console.error('[globe] initialization failed', error);
    }

    return () => {
      if (globeUpdateTimerRef.current !== null) {
        window.clearTimeout(globeUpdateTimerRef.current);
        globeUpdateTimerRef.current = null;
      }
      if (globeRef.current) {
        globeRef.current._destructor?.();
        globeRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!globeRef.current) return;
    if (globeUpdateTimerRef.current !== null) {
      window.clearTimeout(globeUpdateTimerRef.current);
    }

    globeUpdateTimerRef.current = window.setTimeout(() => {
      if (!globeRef.current) return;

      const controls = globeRef.current.controls();
      controls.autoRotate = false;
      controls.autoRotateSpeed = 0;

      const polygonCapColor = (polygon: any) => {
        const numeric = String(polygon?.properties?.id ?? '');
        const country = COUNTRY_BY_NUMERIC.get(numeric);
        if (!country) return 'rgba(90,103,124,0.08)';

        const signal = signalsByIso2.get(country.iso2);
        const burst = signalBursts.find((item) => item.iso2 === country.iso2);
        const isDominant = attentionEvent?.iso2 === country.iso2;
        const hasSelectedFocus = Boolean(selectedCountryIso2 || focusLockIso2);
        const selectedIso2 = focusLockIso2 ?? selectedCountryIso2;

        if (country.iso2 === selectedIso2) return 'rgba(47, 147, 255, 0.2)';
        if (isDominant && attentionEvent?.priority === 'high') return 'rgba(214, 76, 76, 0.16)';

        // System D: ambient glow cycle
        if (country.iso2 === glowIso2) return 'rgba(0, 240, 255, 0.14)';

        if (signal || burst) {
          return 'rgba(113, 134, 162, 0.12)';
        }

        if (hasSelectedFocus || focusTarget) return 'rgba(66,84,109,0.06)';
        return 'rgba(83,102,130,0.1)';
      };

      const polygonAltitude = (polygon: any) => {
        const numeric = String(polygon?.properties?.id ?? '');
        const country = COUNTRY_BY_NUMERIC.get(numeric);
        if (!country) return 0.002;
        const signal = signalsByIso2.get(country.iso2);
        const selectedIso2 = focusLockIso2 ?? selectedCountryIso2;
        if (country.iso2 === selectedIso2) return 0.029;
        if (attentionEvent?.iso2 === country.iso2) {
          return attentionEvent.priority === 'high' ? 0.028 : attentionEvent.priority === 'medium' ? 0.022 : 0.017;
        }
        if (signal) return safeNumber(signal.confidence, 0) >= 0.8 ? 0.022 : safeNumber(signal.confidence, 0) >= 0.55 ? 0.017 : 0.012;
        return 0.006;
      };

      const polygonLabel = (polygon: any) => {
        const numeric = String(polygon?.properties?.id ?? '');
        const country = COUNTRY_BY_NUMERIC.get(numeric);
        if (!country) return '';
        const signal = signalsByIso2.get(country.iso2);
        return `<div style="padding:6px 8px;">
          <div style="font-weight:700;">${country.name}</div>
          <div>${country.iso2} | ${country.region}</div>
          <div>${signal ? `Signal: ${signalActionLabel(signal.action)}` : 'Signal: HOLD'}</div>
          <div>Confidence: ${signal ? Math.round(safeNumber(signal.confidence, 0) * 100) : 0}%</div>
          <div>Topic: ${signal?.topic ?? 'general'}</div>
        </div>`;
      };

      const markers = liveFeed
        .filter((item) => item.iso2)
        .slice(0, cleanMode ? 8 : 16)
        .map((item) => {
          const country = item.iso2 ? countriesByIso2.get(item.iso2) : undefined;
          if (!country) return null;
          if (!isValidLatLng(country.lat, country.lng)) {
            console.warn('Invalid geo mapping skipped', { reason: 'marker-invalid-coordinates', iso2: country.iso2, lat: country.lat, lng: country.lng });
            console.warn('INVALID SIGNAL SKIPPED:', { kind: item.kind, iso2: country.iso2, lat: country.lat, lng: country.lng });
            return null;
          }

          const confidence = safeNumber(item.confidence, 0.25);
          const isSignal = item.kind === 'signal';
          const color = isSignal
            ? signalColor(item.action ?? 'hold')
            : item.kind === 'insight'
              ? '#f6c04c'
              : '#8cc2ff';

          return {
            lat: safeNumber(country.lat, 0),
            lng: safeNumber(country.lng, 0),
            color,
            radius: isSignal ? Math.max(0.14, safeNumber(confidence, 0) * 0.36) : 0.11,
            altitude: isSignal ? 0.05 + safeNumber(confidence, 0) * 0.16 : 0.03,
            label: `<div style="padding:8px 10px;max-width:220px;">
              <div style="font-weight:700;">${country.name}</div>
              <div>${item.title}</div>
              <div>Confidence: ${Math.round(safeNumber(confidence, 0) * 100)}%</div>
            </div>`,
          };
        })
        .filter(Boolean);

      const realRings = signalBursts
        .slice(0, cleanMode ? 6 : 12)
        .map((item) => {
          const country = countriesByIso2.get(item.iso2);
          if (!country) return null;
          if (!isValidLatLng(country.lat, country.lng)) {
            console.warn('Invalid geo mapping skipped', { reason: 'ring-invalid-coordinates', iso2: country.iso2, lat: country.lat, lng: country.lng });
            console.warn('INVALID SIGNAL SKIPPED:', { kind: 'ring', iso2: country.iso2, lat: country.lat, lng: country.lng });
            return null;
          }
          const confidence = safeNumber(item.confidence, 0.45);
          const high = confidence >= 0.8;
          return {
            lat: safeNumber(country.lat, 0),
            lng: safeNumber(country.lng, 0),
            color: signalColor(item.action),
            maxRadius: high ? 10.5 : confidence >= 0.55 ? 7.4 : 4.6,
            speed: high ? 3.2 : confidence >= 0.55 ? 2.1 : 1.2,
            repeat: high ? 520 : confidence >= 0.55 ? 880 : 1400,
          };
        })
        .filter(Boolean);

      // System D: merge real rings with ambient scan rings
      const rings = [...realRings, ...ambientRings];

      try {
        globeRef.current
          .polygonCapColor(polygonCapColor)
          .polygonAltitude(polygonAltitude)
          .polygonLabel(polygonLabel)
          .arcsData(stableArcs)
          .arcStartLat((arc: any) => arc.startLat)
          .arcStartLng((arc: any) => arc.startLng)
          .arcEndLat((arc: any) => arc.endLat)
          .arcEndLng((arc: any) => arc.endLng)
          .arcColor((arc: any) => arcActionColor(String(arc.action ?? 'hold'), safeNumber(arc.confidence, 0)))
          .arcStroke((arc: any) => safeNumber(arc.stroke, 0))
          .arcAltitude((arc: any) => safeNumber(arc.altitude, 0))
          .arcDashLength((arc: any) => safeNumber(arc.dashLength, 0))
          .arcDashGap((arc: any) => safeNumber(arc.dashGap, 0))
          .arcDashAnimateTime((arc: any) => (arc.isNew ? 1500 : 0))
          .pointsData(markers)
          .pointLat((point: any) => safeNumber(point.lat, 0))
          .pointLng((point: any) => safeNumber(point.lng, 0))
          .pointColor((point: any) => point.color)
          .pointRadius((point: any) => safeNumber(point.radius, 0))
          .pointAltitude((point: any) => safeNumber(point.altitude, 0))
          .pointLabel((point: any) => point.label)
          .ringsData(rings)
          .ringLat((ring: any) => safeNumber(ring.lat, 0))
          .ringLng((ring: any) => safeNumber(ring.lng, 0))
          .ringColor((ring: any) => () => ring.color)
          .ringMaxRadius((ring: any) => safeNumber(ring.maxRadius, 0))
          .ringPropagationSpeed((ring: any) => safeNumber(ring.speed, 0))
          .ringRepeatPeriod((ring: any) => safeNumber(ring.repeat, 0));

        console.info('APPLIED TO GLOBE', {
          arcs: stableArcs.length,
          markers: markers.length,
          rings: rings.length,
        });

        if (!stableArcs.length) {
          console.info('ARCS RENDERED:', 0);
        } else {
          console.info('ARCS RENDERED:', stableArcs.length);
        }

        if (focusTarget && isValidLatLng(focusTarget.lat, focusTarget.lng)) {
          globeRef.current.pointOfView(
            {
              lat: safeNumber(focusTarget.lat, 0),
              lng: safeNumber(focusTarget.lng, 0),
              altitude: focusLockIso2 ? 1.28 : 1.52,
            },
            1200,
          );
        }
      } catch (error) {
        console.error('GLOBE UPDATE FAILED', error);
      }
    }, 400);

    return () => {
      if (globeUpdateTimerRef.current !== null) {
        window.clearTimeout(globeUpdateTimerRef.current);
        globeUpdateTimerRef.current = null;
      }
    };
  }, [attentionEvent, focusLockIso2, focusTarget, liveFeed, selectedCountryIso2, signalBursts, signalsByIso2, stableArcs, countriesByIso2, glowIso2, ambientRings]);

  return <div className="globe-stage" ref={containerRef} />;
}

function isValidArc(a: { startLat: number; startLng: number; endLat: number; endLng: number }): boolean {
  if (!isFinite(a.startLat) || !isFinite(a.endLat)) return false;
  if (!isFinite(a.startLng) || !isFinite(a.endLng)) return false;

  const dLat = Math.abs(a.startLat - a.endLat);
  const dLng = Math.abs(a.startLng - a.endLng);

  if (dLat + dLng < 0.1) return false;
  if (a.startLat === a.endLat && a.startLng === a.endLng) return false;

  return true;
}
