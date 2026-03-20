// ---------------------------------------------------------------------------
// src/services/anomaly.ts — Anomaly detection for market intelligence
// ---------------------------------------------------------------------------

export interface AnomalyInput {
  countryId: string;
  currentSentiment: number;
  prevSentiment: number;
  impactLevel: 'low' | 'medium' | 'high';
}

export interface AnomalyResult {
  isAnomaly: boolean;
  reason?: string;
}

/**
 * Detect unusual spikes or sudden shifts in market intelligence data.
 */
export class AnomalyDetector {
  /**
   * Check for anomalies based on sentiment velocity and impact levels.
   */
  detect(input: AnomalyInput): AnomalyResult {
    const { countryId, currentSentiment, prevSentiment, impactLevel } = input;
    
    // 1. Sudden sentiment reversal (e.g. from +0.5 to -0.5)
    const sentimentShift = Math.abs(currentSentiment - prevSentiment);
    if (sentimentShift > 0.8) {
      return {
        isAnomaly: true,
        reason: `Extreme sentiment reversal detected for ${countryId} (${prevSentiment.toFixed(2)} -> ${currentSentiment.toFixed(2)})`
      };
    }

    // 2. High impact headline with near-neutral sentiment (unexpected lack of reaction)
    if (impactLevel === 'high' && Math.abs(currentSentiment) < 0.1) {
      return {
        isAnomaly: true,
        reason: `High impact news for ${countryId} resulted in unexpected neutral sentiment. Potential data outlier or complex geopolitical gridlock.`
      };
    }

    // 3. Extreme single-point sentiment
    if (Math.abs(currentSentiment) > 0.95) {
      return {
        isAnomaly: true,
        reason: `Hyper-polarized sentiment spike for ${countryId} (${currentSentiment.toFixed(2)}). May indicate panic or irrational exuberance.`
      };
    }

    return { isAnomaly: false };
  }
}

export const anomalyDetector = new AnomalyDetector();
