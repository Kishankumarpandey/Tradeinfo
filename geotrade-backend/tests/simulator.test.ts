// ---------------------------------------------------------------------------
// tests/simulator.test.ts — MarketSimulator unit tests
// ---------------------------------------------------------------------------
import { MarketSimulator, TickPayload } from '../src/sim_engine/simulator';

describe('MarketSimulator', () => {
  // ── Basic tick behavior ─────────────────────────────────────────────────
  it('should emit tick events with expected structure', (done) => {
    const sim = new MarketSimulator({ numCountries: 4, tickIntervalMs: 50, seed: 1 });

    sim.on('tick', (payload: TickPayload) => {
      expect(payload.timestamp).toBeGreaterThan(0);
      expect(payload.countries).toHaveLength(4);

      const c = payload.countries[0];
      expect(c.id).toBe('c0');
      expect(c.name).toBe('United States');
      expect(typeof c.index).toBe('number');
      expect(typeof c.change_percent).toBe('number');
      expect(typeof c.volume).toBe('number');

      sim.stop();
      done();
    });

    sim.start();
  });

  // ── Drift behavior ──────────────────────────────────────────────────────
  it('should update index on each tick (indices change)', () => {
    const sim = new MarketSimulator({ numCountries: 2, seed: 42 });

    // Record initial values
    const initial = sim.countries.map((c) => c.index);

    // Run 10 manual ticks
    for (let i = 0; i < 10; i++) sim.tick();

    // At least one country's index should have changed
    const changed = sim.countries.some(
      (c, idx) => Math.abs(c.index - initial[idx]) > 0.001,
    );
    expect(changed).toBe(true);
  });

  // ── Seed reproducibility ────────────────────────────────────────────────
  it('should produce identical sequences for the same seed', () => {
    const run = (seed: number) => {
      const sim = new MarketSimulator({ numCountries: 3, seed });
      const ticks: TickPayload[] = [];
      sim.on('tick', (p: TickPayload) => ticks.push(p));
      for (let i = 0; i < 20; i++) sim.tick();
      return ticks.map((t) => t.countries.map((c) => c.index));
    };

    const a = run(12345);
    const b = run(12345);

    expect(a).toEqual(b);
  });

  it('should produce different sequences for different seeds', () => {
    const run = (seed: number) => {
      const sim = new MarketSimulator({ numCountries: 2, seed });
      for (let i = 0; i < 5; i++) sim.tick();
      return sim.countries.map((c) => c.index);
    };

    const a = run(111);
    const b = run(999);

    // Extremely unlikely to be equal with different seeds
    const same = a.every((v, i) => Math.abs(v - b[i]) < 0.001);
    expect(same).toBe(false);
  });

  // ── Event emission count ────────────────────────────────────────────────
  it('should emit exactly N tick events for N manual ticks', () => {
    const sim = new MarketSimulator({ numCountries: 2, seed: 7 });
    let count = 0;
    sim.on('tick', () => count++);

    for (let i = 0; i < 50; i++) sim.tick();

    expect(count).toBe(50);
  });

  // ── Drift modifier (from events engine) ─────────────────────────────────
  it('should apply drift modifiers and let them expire', () => {
    const sim = new MarketSimulator({ numCountries: 2, seed: 55, volatility: 0 });

    // With zero volatility, change is purely from drift
    sim.applyDriftModifier(['c0'], -0.05, 3);

    const valueBefore = sim.countries[0].index;
    for (let i = 0; i < 3; i++) sim.tick();
    const valueAfterMod = sim.countries[0].index;

    // The index should have dropped due to negative drift
    expect(valueAfterMod).toBeLessThan(valueBefore);

    // Run more ticks — modifier should be expired, drift goes back to base
    const valueBeforeExpire = sim.countries[0].index;
    for (let i = 0; i < 3; i++) sim.tick();
    const valueAfterExpire = sim.countries[0].index;

    // After expiry, drift returns to positive base mean drift, so index should rise
    expect(valueAfterExpire).toBeGreaterThan(valueBeforeExpire);
  });

  // ── Start / stop lifecycle ──────────────────────────────────────────────
  it('should start and stop correctly', () => {
    const sim = new MarketSimulator({ numCountries: 1, tickIntervalMs: 100, seed: 1 });

    expect(sim.running).toBe(false);
    sim.start();
    expect(sim.running).toBe(true);
    sim.stop();
    expect(sim.running).toBe(false);
  });

  // ── Speed change ──────────────────────────────────────────────────────
  it('should allow changing tick speed', () => {
    const sim = new MarketSimulator({ numCountries: 1, tickIntervalMs: 1000, seed: 1 });
    sim.start();
    sim.setSpeed(200);
    expect(sim.running).toBe(true);
    sim.stop();
  });

  // ── Country count ────────────────────────────────────────────────────────
  it('should respect numCountries config', () => {
    const sim3 = new MarketSimulator({ numCountries: 3, seed: 1 });
    expect(sim3.countries).toHaveLength(3);

    const sim8 = new MarketSimulator({ numCountries: 8, seed: 1 });
    expect(sim8.countries).toHaveLength(8);
  });
});
