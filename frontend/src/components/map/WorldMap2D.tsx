import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { COUNTRY_BY_NUMERIC } from '../../data/countries';
import { getWorldCountryFeatures } from '../../data/worldGeometry';
import { signalColor } from '../../services/signalMapper';
import { useGeoTradeState } from '../../state/GeoTradeState';

const WIDTH = 1200;
const HEIGHT = 620;
const MAX_FLOW_AGE_MS = 15 * 60 * 1000;

export function WorldMap2D() {
  const {
    selectedCountryIso2,
    selectCountryByIso2,
    focusTarget,
    signalsByIso2,
    signalFlows,
    liveFeed,
    signalBursts,
    setHoveredCountry,
    attentionEvent,
    focusLockIso2,
  } = useGeoTradeState();

  const features = useMemo(() => getWorldCountryFeatures(), []);
  const projection = useMemo(
    () => d3.geoNaturalEarth1().fitSize([WIDTH, HEIGHT], { type: 'FeatureCollection', features }),
    [features],
  );
  const path = useMemo(() => d3.geoPath(projection), [projection]);
  const visibleFlows = useMemo(
    () => signalFlows
      .filter((flow) => flow.sourceIso2 !== flow.targetIso2)
      .filter((flow) => Date.now() - flow.timestamp <= MAX_FLOW_AGE_MS)
      .filter((flow) => flow.confidence >= 0.45)
      .slice(0, 18),
    [signalFlows],
  );

  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;

    const svg = d3.select(svgRef.current);
    const group = d3.select(gRef.current);

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .on('zoom', (event) => {
        group.attr('transform', event.transform.toString());
        setZoom(event.transform.k);
      });

    svg.call(zoomBehavior);

    return () => {
      svg.on('.zoom', null);
    };
  }, []);

  useEffect(() => {
    if (!focusTarget || !gRef.current || !svgRef.current) return;

    const [x, y] = projection([focusTarget.lng, focusTarget.lat]) ?? [WIDTH / 2, HEIGHT / 2];
    const k = 2.7;
    const tx = WIDTH / 2 - x * k;
    const ty = HEIGHT / 2 - y * k;

    d3.select(svgRef.current)
      .transition()
      .duration(1000)
      .ease(d3.easeCubicOut)
      .call(
        d3.zoom<SVGSVGElement, unknown>().transform,
        d3.zoomIdentity.translate(tx, ty).scale(k),
      );
  }, [focusTarget, projection]);

  return (
    <div className="map2d-wrap">
      <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="map2d-svg" role="img" aria-label="World map">
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="rgba(10,22,38,0.96)" />
        <g ref={gRef}>
          <g className="signal-flow-layer">
            {visibleFlows.map((flow, index) => {
              const source = [...COUNTRY_BY_NUMERIC.values()].find((country) => country.iso2 === flow.sourceIso2);
              const target = [...COUNTRY_BY_NUMERIC.values()].find((country) => country.iso2 === flow.targetIso2);
              if (!source || !target) return null;

              const sourcePoint = projection([source.lng, source.lat]);
              const targetPoint = projection([target.lng, target.lat]);
              if (!sourcePoint || !targetPoint) return null;

              const dx = (targetPoint[0] - sourcePoint[0]) / 2;
              const dy = (targetPoint[1] - sourcePoint[1]) / 2;
              const curve = `M ${sourcePoint[0]} ${sourcePoint[1]} Q ${sourcePoint[0] + dx} ${sourcePoint[1] + dy - 40} ${targetPoint[0]} ${targetPoint[1]}`;

              return (
                <path
                  key={`${flow.sourceIso2}-${flow.targetIso2}-${flow.timestamp}-${index}`}
                  d={curve}
                  fill="none"
                  stroke={signalColor(flow.action)}
                  strokeOpacity={0.74}
                  strokeWidth={Math.max(1.3, flow.confidence * 4)}
                  className="signal-flow-line"
                />
              );
            })}
          </g>
          <g className="event-marker-layer">
            {liveFeed
              .filter((item) => item.iso2)
              .slice(0, 20)
              .map((item, index) => {
                const country = item.iso2 ? [...COUNTRY_BY_NUMERIC.values()].find((entry) => entry.iso2 === item.iso2) : undefined;
                if (!country) return null;
                const point = projection([country.lng, country.lat]);
                if (!point) return null;
                const isSignal = item.kind === 'signal';
                const isCritical = (item.confidence ?? 0) >= 0.8 || item.severity === 'critical';
                const markerRadius = isSignal ? 8 + (item.confidence ?? 0) * 18 : 6;
                const markerColor = item.kind === 'signal'
                  ? signalColor(item.action ?? 'hold')
                  : item.kind === 'insight'
                    ? '#f6c04c'
                    : '#8cc2ff';

                return (
                  <g key={`${item.id}-${item.timestamp}-${index}`} className={`event-marker ${item.kind} ${isCritical ? 'critical' : ''}`} transform={`translate(${point[0]}, ${point[1]})`}>
                    <circle r={markerRadius} fill={markerColor} fillOpacity={0.18} className="event-marker-pulse" />
                    <circle r={Math.max(3, markerRadius * 0.34)} fill={markerColor} stroke="rgba(255,255,255,0.82)" strokeWidth={1} />
                  </g>
                );
              })}
            {signalBursts.slice(0, 12).map((burst, index) => {
              const country = [...COUNTRY_BY_NUMERIC.values()].find((entry) => entry.iso2 === burst.iso2);
              if (!country) return null;
              const point = projection([country.lng, country.lat]);
              if (!point) return null;
              const strength = burst.confidence >= 0.8 ? 'high' : burst.confidence >= 0.55 ? 'medium' : 'low';
              const isDominantBurst = attentionEvent?.iso2 === burst.iso2;
              return (
                <g key={`${burst.id}-${burst.timestamp}-${index}`} className={`signal-burst ${strength} ${isDominantBurst ? 'dominant' : ''}`} transform={`translate(${point[0]}, ${point[1]})`}>
                  <circle r={10 + burst.confidence * 16} className="burst-flash" fill={signalColor(burst.action)} />
                  <circle r={8 + burst.confidence * 18} className="burst-ripple" stroke={signalColor(burst.action)} fill="none" strokeWidth={2} />
                  <circle r={4 + burst.confidence * 6} className="burst-core" fill={signalColor(burst.action)} />
                </g>
              );
            })}
          </g>
          {features.map((feature) => {
            const numeric = String(feature.properties.id);
            const country = COUNTRY_BY_NUMERIC.get(numeric);
            const iso2 = country?.iso2;
            const signal = iso2 ? signalsByIso2.get(iso2) : null;
            const selectedIso2 = focusLockIso2 ?? selectedCountryIso2;
            const isSelected = iso2 === selectedIso2;
            const isActive = Boolean(signal);
            const hasFocus = Boolean(focusTarget || selectedIso2);
            const burst = iso2 ? signalBursts.find((item) => item.iso2 === iso2) : null;
            const isDominant = iso2 && attentionEvent?.iso2 === iso2;
            const signalConfidence = signal?.confidence ?? 0;

            return (
              <path
                key={numeric}
                d={path(feature) ?? undefined}
                fill={
                  isSelected
                    ? 'rgba(47, 147, 255, 0.2)'
                    : signal || burst
                      ? 'rgba(96, 118, 146, 0.22)'
                      : 'rgba(94,114,140,0.52)'
                }
                fillOpacity={
                  isSelected
                    ? 1
                    : isDominant
                      ? attentionEvent?.priority === 'high'
                        ? 0.32
                        : attentionEvent?.priority === 'medium'
                          ? 0.28
                          : 0.22
                    : isActive
                      ? signalConfidence >= 0.8
                        ? 0.32
                        : signalConfidence >= 0.55
                          ? 0.28
                          : 0.24
                      : hasFocus
                        ? 0.1
                        : 0.22
                }
                stroke={isSelected ? 'rgba(255,255,255,0.98)' : isActive ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.14)'}
                strokeWidth={isSelected ? 1.7 / zoom : isActive ? 1.1 / zoom : 0.45 / zoom}
                className={`country-shape ${isSelected ? 'selected' : ''} ${isActive ? 'active' : 'dimmed'} ${burst ? 'flash' : ''} ${isDominant ? `event-${attentionEvent?.priority ?? 'low'}` : ''}`}
                onClick={() => {
                  if (!iso2 || !country) return;
                  console.info('[map2d-click]', { country: country.name, iso2: country.iso2 });
                  selectCountryByIso2(iso2, 'map-click');
                }}
                onMouseEnter={() => {
                  if (!country) return;
                  setHoveredCountry({
                    iso2: country.iso2,
                    title: country.name,
                    countryName: country.name,
                    action: signal?.action ?? 'hold',
                    confidence: signal?.confidence ?? 0,
                    sentimentLabel: signal?.sentimentLabel ?? 'neutral',
                    topic: signal?.topic,
                    reason: signal?.reason,
                  });
                }}
                onMouseLeave={() => setHoveredCountry(null)}
              >
                {country ? <title>{country.name}</title> : null}
              </path>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
