import { useMemo, useState } from 'react';
import { useGeoTradeState } from '../../state/GeoTradeState';

export function SearchBar() {
  const { search, selectSearchResult } = useGeoTradeState();
  const [query, setQuery] = useState('');

  const results = useMemo(() => search(query), [query, search]);

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="search-bar"
        placeholder="Query Global Intelligence..."
        aria-label="Search countries or assets"
      />
      {query.trim().length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: 'rgba(5, 8, 12, 0.95)', backdropFilter: 'blur(10px)', border: '1px solid var(--neon-cyan)', borderRadius: 'var(--radius-sm)', zIndex: 50, overflow: 'hidden' }}>
          {results.length === 0 && <div style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>No matches</div>}
          {results.map((result) => (
            <button
              key={result.id}
              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', background: 'transparent', border: 'none', padding: '0.75rem', color: 'var(--text-main)', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
              onClick={() => {
                selectSearchResult(result);
                setQuery('');
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 240, 255, 0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <span>{result.label}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--neon-cyan)', textTransform: 'uppercase' }}>{result.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

