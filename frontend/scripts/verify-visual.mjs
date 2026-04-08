import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const outDir = 'd:/GeoTrade/artifacts/screenshots';
fs.mkdirSync(outDir, { recursive: true });

const requiredPhrases = ['SIGNAL RECEIVED', 'SIGNAL MAPPED', 'SIGNAL APPLIED', 'UI UPDATED'];
const seen = new Set();
const consoleLines = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

page.on('console', (msg) => {
  const text = msg.text();
  consoleLines.push(text);
  for (const phrase of requiredPhrases) {
    if (text.includes(phrase)) {
      seen.add(phrase);
    }
  }
});

await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(12000);

await page.screenshot({ path: path.join(outDir, '01-globe-view-a.png'), fullPage: true });
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(outDir, '01-globe-view-b.png'), fullPage: true });

const aiCard = page.locator('.info-card').filter({ hasText: 'AI Command Center' }).first();
await aiCard.screenshot({ path: path.join(outDir, '02-ai-command-center.png') });

const chartCard = page.locator('.chart-dock-card').first();
if (await chartCard.count()) {
  await chartCard.screenshot({ path: path.join(outDir, '03-chart-panel.png') });
}

const feedCard = page.locator('.signal-feed-card').first();
await feedCard.screenshot({ path: path.join(outDir, '04-signal-feed.png') });

const ticker = page.locator('.ticker-bar').first();
await ticker.screenshot({ path: path.join(outDir, '04-ticker.png') });

const firstFeedRow = page.locator('.signal-feed-row').first();
if (await firstFeedRow.count()) {
  await firstFeedRow.click();
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: path.join(outDir, '05-interaction-feed-click.png'), fullPage: true });

await page.getByRole('button', { name: '2D Map' }).click();
await page.waitForTimeout(1200);
const firstCountry = page.locator('.country-shape').first();
if (await firstCountry.count()) {
  try {
    await firstCountry.click({ timeout: 5000, force: true });
    await page.waitForTimeout(2500);
  } catch {
    // Continue verification even if map layer does not accept pointer events in headless mode.
    await page.waitForTimeout(1200);
  }
}
await page.screenshot({ path: path.join(outDir, '05-interaction-country-click.png'), fullPage: true });

const report = {
  timestamp: new Date().toISOString(),
  requiredPhrases,
  seenPhrases: Array.from(seen),
  allPresent: requiredPhrases.every((p) => seen.has(p)),
  sampleConsoleLines: consoleLines.slice(-120),
};

fs.writeFileSync(path.join(outDir, 'verification-report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(outDir, 'verification-report.txt'), [
  `allPresent=${report.allPresent}`,
  `seen=${Array.from(seen).join(', ')}`,
  '--- recent console ---',
  ...report.sampleConsoleLines,
].join('\n'));

await browser.close();
console.log('verification-complete', report);
