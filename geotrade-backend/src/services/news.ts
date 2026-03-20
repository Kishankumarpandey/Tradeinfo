// ---------------------------------------------------------------------------
// src/services/news.ts — RSS news fetcher (no API keys)
// ---------------------------------------------------------------------------
import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 8_000,
  headers: { 'User-Agent': 'GeoTrade/1.0' },
});

export interface RawNewsItem {
  title: string;
  description: string;
  source: string;
  timestamp: number;
}

/** Public RSS feeds — no authentication required */
const RSS_FEEDS: { url: string; source: string }[] = [
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                source: 'BBC World' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml',             source: 'BBC Business' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',     source: 'NYT World' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',  source: 'NYT Business' },
  { url: 'https://feeds.reuters.com/reuters/worldNews',                  source: 'Reuters World' },
  { url: 'https://feeds.reuters.com/reuters/businessNews',               source: 'Reuters Business' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml',                   source: 'Al Jazeera' },
  { url: 'https://feeds.feedburner.com/ndaborsa',                        source: 'CNBC' },
];

/**
 * Fetch a single RSS feed, returning parsed news items.
 * Silently returns [] on failure (network issues, bad XML, etc.)
 */
async function fetchFeed(feed: { url: string; source: string }): Promise<RawNewsItem[]> {
  try {
    const result = await parser.parseURL(feed.url);
    return (result.items ?? []).map((item) => ({
      title: (item.title ?? '').trim(),
      description: (item.contentSnippet ?? item.content ?? item.summary ?? '').trim().slice(0, 500),
      source: feed.source,
      timestamp: item.isoDate ? new Date(item.isoDate).getTime() : Date.now(),
    })).filter((n) => n.title.length > 0);
  } catch {
    // Feed unavailable — no crash, just skip
    return [];
  }
}

/**
 * Fetch latest news from all configured RSS feeds.
 * Returns deduplicated items sorted newest-first (max 100).
 */
export async function getLatestNews(): Promise<RawNewsItem[]> {
  const allItems: RawNewsItem[] = [];

  // Fetch all feeds in parallel
  const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed));

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value);
    }
  }

  // Deduplicate by title similarity (exact match)
  const seen = new Set<string>();
  const unique = allItems.filter((item) => {
    const key = item.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort newest first, cap at 100
  unique.sort((a, b) => b.timestamp - a.timestamp);
  return unique.slice(0, 100);
}

/**
 * Get feeds config (for debugging / status endpoints)
 */
export function getFeedSources(): string[] {
  return RSS_FEEDS.map((f) => f.source);
}
