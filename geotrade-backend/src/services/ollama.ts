export interface OllamaResponse {
  cause: string;
  impact: string;
  asset: string;
  decision: 'buy' | 'sell' | 'hold' | 'strong_buy' | 'strong_sell';
  confidence: number;
}

export async function generateReasoning(headline: string, country: string, sentiment: number): Promise<OllamaResponse | null> {
  const prompt = `Analyze the following geopolitical news and produce a trading insight.

Headline: ${headline}
Country: ${country}
Sentiment: ${sentiment}

Return STRICTLY in this format:
Cause: [brief causal event]
Impact: [brief economic impact]
Asset: [mapped asset or related sector]
Action: [buy/sell/hold/strong_buy/strong_sell]
Confidence: [0.0 to 1.0]`;

  try {
    console.log(`[Ollama] Requesting reasoning for: ${headline}`);
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3:4b',
        prompt: prompt,
        stream: false,
        options: { temperature: 0.1 }
      })
    });

    if (!res.ok) {
      console.error(`[Ollama] API Error: ${res.statusText}`);
      return null;
    }

    const data = (await res.json()) as any;
    const resultText = data.response || '';
    
    // Parse STRICT formatting
    const causeMatch = resultText.match(/Cause:\s*(.*)/i);
    const impactMatch = resultText.match(/Impact:\s*(.*)/i);
    const assetMatch = resultText.match(/Asset:\s*(.*)/i);
    const actionMatch = resultText.match(/Action:\s*(.*)/i);
    const confidenceMatch = resultText.match(/Confidence:\s*([0-9.]+)/i);

    if (causeMatch && impactMatch && assetMatch && actionMatch && confidenceMatch) {
      const parsedAction = actionMatch[1].trim().toLowerCase();
      // Ensure strict mapping
      let finalAction: OllamaResponse['decision'] = 'hold';
      if (['buy', 'sell', 'hold', 'strong_buy', 'strong_sell'].includes(parsedAction)) {
        finalAction = parsedAction as OllamaResponse['decision'];
      }

      return {
        cause: causeMatch[1].trim(),
        impact: impactMatch[1].trim(),
        asset: assetMatch[1].trim(),
        decision: finalAction,
        confidence: parseFloat(confidenceMatch[1].trim())
      };
    } else {
      console.warn('[Ollama] Failed to parse strict output', { text: resultText });
      return null;
    }
  } catch (err) {
    console.error('[Ollama] Network / Failsafe caught:', err);
    return null;
  }
}
