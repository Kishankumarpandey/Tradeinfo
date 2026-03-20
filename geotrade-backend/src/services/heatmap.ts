// ---------------------------------------------------------------------------
// src/services/heatmap.ts — Heatmap engine for signal visualization
// ---------------------------------------------------------------------------

export interface HeatmapInput {
  countryId: string;
  score: number;
  action: 'buy' | 'sell' | 'hold' | 'strong_buy' | 'strong_sell';
}

export interface HeatmapOutput {
  countryId: string;
  color: 'green' | 'red' | 'yellow' | 'gray';
  intensity: number; // 0 to 1
}

/**
 * Convert signal score and action into heatmap visualization data.
 * Intensity scales based on score/confidence.
 */
export function generateHeatmap(input: HeatmapInput): HeatmapOutput {
  const { countryId, score, action } = input;

  let color: HeatmapOutput['color'] = 'gray';
  let intensity = (score / 100);

  if (action.includes('buy')) {
    color = 'green';
  } else if (action.includes('sell')) {
    color = 'red';
  } else if (action === 'hold') {
    color = 'yellow';
    // Intensity for "hold" usually means uncertainty or "watch", 
    // but here we'll scale it by how close it was to a trigger
    intensity = Math.max(0.2, score / 100);
  }

  // Ensure intensity is within bounds
  intensity = Math.min(1, Math.max(0, intensity));

  return {
    countryId,
    color,
    intensity: Math.round(intensity * 100) / 100
  };
}
