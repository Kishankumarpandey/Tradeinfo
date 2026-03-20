// ---------------------------------------------------------------------------
// src/sim_engine/demo.ts — Quick demo that starts the simulator and logs ticks
// ---------------------------------------------------------------------------
import { MarketSimulator } from './simulator';

const sim = new MarketSimulator({
  numCountries: 6,
  tickIntervalMs: 1000,
  seed: 123,
});

sim.on('tick', (payload) => {
  console.clear();
  console.log(`\n📊 Tick @ ${new Date(payload.timestamp).toISOString()}\n`);
  console.table(
    payload.countries.map((c: any) => ({
      Country: c.name,
      Index: c.index.toFixed(2),
      'Change %': c.change_percent.toFixed(4),
      Volume: c.volume.toLocaleString(),
    })),
  );
});

sim.start();

// Graceful shutdown
process.on('SIGINT', () => {
  sim.stop();
  process.exit(0);
});
