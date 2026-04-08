export function mapCountryToBinanceSymbol(countryId: string | undefined): string {
  if (!countryId) return 'BTCUSDT';
  
  const id = countryId.toUpperCase();
  
  // Deterministic routing
  if (['US', 'CA', 'MX'].includes(id)) return 'BTCUSDT';
  if (['GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'CH', 'SE', 'PL', 'BE', 'RO', 'AT'].includes(id)) return 'EURUSDT'; // European nations proxy
  if (id === 'JP') return 'BTCUSDT'; // JPY proxy 
  if (id === 'CN' || id === 'TW' || id === 'KR' || id === 'HK') return 'ETHUSDT'; 
  
  // Oil countries
  if (['SA', 'AE', 'IQ', 'KW', 'IR', 'RU', 'VE', 'NG', 'NO'].includes(id)) return 'BTCUSDT';

  // Emerging markets / others
  if (['IN', 'BR', 'ZA', 'ID', 'TR', 'AR'].includes(id)) return 'BNBUSDT';
  if (['AU', 'NZ'].includes(id)) return 'SOLUSDT';

  // Default fallback stream
  return 'BTCUSDT';
}
