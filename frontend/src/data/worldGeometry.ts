import world110m from 'world-atlas/countries-110m.json';
import { feature } from 'topojson-client';

export type WorldCountryFeature = GeoJSON.Feature<GeoJSON.MultiPolygon | GeoJSON.Polygon, { id: string }>;

export function getWorldCountryFeatures(): WorldCountryFeature[] {
  const fc = feature(
    world110m as any,
    (world110m as any).objects.countries,
  ) as unknown as GeoJSON.FeatureCollection<GeoJSON.MultiPolygon | GeoJSON.Polygon, { id: string }>;

  return fc.features
    .map((f) => ({
      ...f,
      properties: {
        ...(f.properties ?? {}),
        id: String(f.id ?? (f.properties as any)?.id ?? ''),
      },
    }))
    .filter((f) => f.properties.id.length > 0);
}
