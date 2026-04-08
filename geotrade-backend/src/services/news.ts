// ---------------------------------------------------------------------------
// src/services/news.ts — RSS news fetcher (event-driven)
// ---------------------------------------------------------------------------
import Parser from 'rss-parser';
import { EventEmitter } from 'events';

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

const RSS_FEEDS: { url: string; source: string }[] = [
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                source: 'BBC World' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml',             source: 'BBC Business' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',     source: 'NYT World' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',  source: 'NYT Business' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml',                   source: 'Al Jazeera' },
  { url: 'https://feeds.feedburner.com/ndaborsa',                        source: 'CNBC' },
];

class NewsMonitor extends EventEmitter {
  private seenKeys = new Set<string>();
  private active = false;

  public start() {
    this.active = true;
    this.poll();
  }

  public stop() {
    this.active = false;
  }

  private async poll() {
    if (!this.active) return;
    
    try {
      const results = await Promise.allSettled(
        RSS_FEEDS.map(async feed => {
          const result = await parser.parseURL(feed.url);
          return (result.items ?? []).map((item) => ({
            title: (item.title ?? '').trim(),
            description: (item.contentSnippet ?? item.content ?? item.summary ?? '').trim().slice(0, 500),
            source: feed.source,
            timestamp: item.isoDate ? new Date(item.isoDate).getTime() : Date.now(),
          })).filter((n) => n.title.length > 0);
        })
      );

      const allItems: RawNewsItem[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allItems.push(...result.value);
        }
      }

      allItems.sort((a, b) => a.timestamp - b.timestamp); // Sort oldest first so emits are linear

      let newItemsCount = 0;
      for (const item of allItems) {
        const key = item.title.toLowerCase().slice(0, 60);
        if (!this.seenKeys.has(key)) {
          this.seenKeys.add(key);
          
          // Emit each new item instantly (event-driven architecture)
          this.emit('news_arrival', item);
          newItemsCount++;
          
          // Restrict memory
          if (this.seenKeys.size > 5000) {
            this.seenKeys.clear();
          }
        }
      }

    } catch (e) {
      console.warn('[news] RSS polling error', e);
    }

    // Recursively poll without setInterval
    if (this.active) {
      setTimeout(() => this.poll(), 15_000);
    }
  }
}

export const newsMonitor = new NewsMonitor();
