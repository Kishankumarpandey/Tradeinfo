# 🌍 Geo trade

[![CI](https://github.com/Kishankumarpandey/GeoTrade/actions/workflows/ci.yml/badge.svg)](https://github.com/Kishankumarpandey/GeoTrade/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Python](https://img.shields.io/badge/python-%3E%3D3.12-blue)](https://python.org)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white)](docker-compose.yml)

> Real-time geopolitical trading simulation platform — trade country economic indices powered by a live market simulator, macro events engine, and ML prediction service.

---

## Project Overview

GeoTrade is a full-stack simulation platform where users trade **country economic indices** in real-time. A market simulator produces tick-by-tick price updates using random-walk models with mean drift. Macro events (interest rate changes, natural disasters, policy shifts) inject volatility. An ML microservice provides directional predictions. WebSocket streams deliver live data to connected clients.

### Architecture

```
┌──────────────┐    WebSocket (ws://)     ┌────────────────────┐
│   Frontend   │ ◄──────────────────────► │    Express + WS    │
│  (React)     │    REST (/api/*)         │  geotrade-backend  │
└──────────────┘                          └────────┬───────────┘
                                                   │
                              ┌─────────────┬──────┴──────┬────────────┐
                              │             │             │            │
                        ┌─────┴─────┐ ┌─────┴─────┐ ┌────┴────┐ ┌────┴────┐
                        │  Market   │ │  Macro    │ │ Candle  │ │  Trade  │
                        │ Simulator │ │  Events   │ │  Agg.   │ │ Ledger  │
                        └───────────┘ └───────────┘ └─────────┘ └─────────┘
                                                          │
                                                   ┌──────┴──────┐
                                                   │  ML Service │
                                                   │  (FastAPI)  │
                                                   └──────┬──────┘
                                                          │
                                               ┌─────────┴─────────┐
                                               │  PostgreSQL / Redis│
                                               └───────────────────┘
```

---

## How It Works

1. **MarketSimulator** maintains N country indices, updating each tick with a seeded random-walk (Mulberry32 PRNG, Box-Muller for Gaussian returns).
2. **MacroEventEngine** randomly generates macro events (rate hikes, disasters, policy changes) that inject drift modifiers into affected countries.
3. **CandlestickAggregator** converts raw ticks into OHLCV candles (1m, 5m intervals).
4. **WebSocket server** broadcasts `market_tick` events to all clients; supports `subscribe`/`unsubscribe` per country and candle requests.
5. **Trade API** provides `POST /api/trade` and `GET /api/portfolio/:userId` with in-memory ledger (MVP).
6. **ML Service** (FastAPI) trains a logistic regression on synthetic data at startup and returns directional probabilities at `POST /predict`.

---

## Local Setup

### Prerequisites

- **Node.js** ≥ 20
- **Python** ≥ 3.12 (for ML service)
- **Docker & Docker Compose** (optional, for full stack)

### Development (backend only)

```bash
cd geotrade-backend

# Install dependencies
npm install

# Start dev server with hot-reload (nodemon + ts-node)
npm run dev

# Run simulation demo
npm run demo

# Run tests
npm test

# Build for production
npm run build
npm start
```

The server starts on `http://localhost:4000` by default. Set `PORT` env to change.

### Docker (full stack)

```bash
# Copy env
cp .env.example .env

# Build and start all services
docker compose up --build

# Services:
#   - Backend:     http://localhost:4000
#   - Frontend:    http://localhost:3000
#   - ML Service:  http://localhost:8000
#   - PostgreSQL:  localhost:5432
#   - Redis:       localhost:6379
```

---

## API Reference

### WebSocket Messages (`ws://localhost:4000/ws`)

#### Server → Client

| Type | Payload | Description |
|------|---------|-------------|
| `welcome` | `{type, ts}` | Sent on connection |
| `market_tick` | `{type, ts, countries: [{id, name, index, change_percent, volume}]}` | Every tick |
| `candle_complete` | `{type, countryId, interval, ts, open, high, low, close, volume}` | When a candle closes |
| `subscribed` | `{type, countryId}` | Subscription confirmed |
| `unsubscribed` | `{type, countryId}` | Unsubscription confirmed |
| `candles` | `{type, countryId, candles: [...]}` | Response to `get_candles` |
| `pong` | `{type, ts}` | Heartbeat response |
| `error` | `{type, message}` | Parse error |

#### Client → Server

| Type | Payload | Description |
|------|---------|-------------|
| `subscribe` | `{type, countryId}` | Subscribe to a country |
| `unsubscribe` | `{type, countryId}` | Unsubscribe |
| `get_candles` | `{type, countryId, interval?, sinceTs?}` | Request candle history |
| `ping` | `{type}` | Heartbeat ping |

### REST Endpoints

#### `GET /health`

```json
{ "status": "ok", "uptime": 123.456 }
```

#### `POST /api/trade`

```json
// Request
{ "userId": "user1", "countryId": "c0", "action": "buy", "amount": 10 }

// Response
{
  "message": "BUY 10 units of c0 @ $2345.67",
  "trade": { "userId": "user1", "countryId": "c0", "action": "buy", "amount": 10, "price": 2345.67, "total": 23456.7, "timestamp": 1710000000000 },
  "portfolio": { "userId": "user1", "cash": 76543.30, "positions": [{ "countryId": "c0", "quantity": 10, "avgCost": 2345.67 }] }
}
```

#### `GET /api/portfolio/:userId`

```json
{ "userId": "user1", "cash": 76543.30, "positions": [{ "countryId": "c0", "quantity": 10, "avgCost": 2345.67 }] }
```

#### `POST /predict` (ML Service — port 8000)

```json
// Request
{ "countryId": "c0", "candles": [{"ts":0,"open":100,"high":101,"low":99,"close":100.5,"volume":1000}], "horizon_seconds": 60 }

// Response
{ "countryId": "c0", "horizon_seconds": 60, "prob_up": 0.5423, "prob_down": 0.4577, "expected_move_pct": 0.0312 }
```

---

## Roadmap & Deep Features

### Phase 1 — MVP ✅
- [x] Market simulator with seeded PRNG
- [x] WebSocket real-time streaming
- [x] Candlestick aggregation (1m, 5m)
- [x] In-memory trade ledger
- [x] Macro event engine
- [x] ML prediction microservice
- [x] Docker Compose orchestration
- [x] CI/CD pipeline

### Phase 2 — Persistence & Auth
- [ ] PostgreSQL integration for trades, portfolios, and candle history
- [ ] Redis pub/sub for horizontal WS scaling
- [ ] JWT authentication & user registration
- [ ] Rate limiting and API keys

### Phase 3 — Advanced Simulation
- [ ] Correlated country indices (cross-correlation matrix)
- [ ] News sentiment integration (NLP pipeline)
- [ ] Circuit breakers and trading halts
- [ ] Options / derivatives on country indices
- [ ] Configurable market hours and sessions

### Phase 4 — Frontend
- [ ] React dashboard with live charts (TradingView lightweight-charts)
- [ ] Order book visualization
- [ ] Portfolio P&L tracker with sparklines
- [ ] Country heatmap (world map)
- [ ] Event timeline and news feed

### Phase 5 — ML & Intelligence
- [ ] LSTM / Transformer-based price prediction
- [ ] Reinforcement learning trading agents
- [ ] Anomaly detection for event impact
- [ ] Feature store with historical candle data
- [ ] A/B testing framework for model deployment
