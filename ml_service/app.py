"""
ml_service/app.py — FastAPI prediction + advice microservice (v2)
"""
import math
import random
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel
from sklearn.linear_model import LogisticRegression  # type: ignore

app = FastAPI(title="GeoTrade ML Service", version="2.0.0")

# ── Schemas ──────────────────────────────────────────────────────────────────

class CandleInput(BaseModel):
    ts: float
    open: float
    high: float
    low: float
    close: float
    volume: float

class PredictRequest(BaseModel):
    countryId: str
    candles: list[CandleInput]
    horizon_seconds: int = 60

class PredictResponse(BaseModel):
    countryId: str
    horizon_seconds: int
    prob_up: float
    prob_down: float
    expected_move_pct: float

class AdviceRequest(BaseModel):
    countryId: str
    candles: list[CandleInput] = []
    horizon_seconds: int = 60

class AdviceResponse(BaseModel):
    countryId: str
    recommendation: str          # "buy" | "sell" | "hold"
    confidence: float            # 0-1
    reason: str                  # human-like explanation

# ── Feature computation ──────────────────────────────────────────────────────

def _compute_features(candles: list[dict]) -> np.ndarray:
    """Returns, volatility, volume trend, momentum."""
    closes = [c["close"] for c in candles]
    volumes = [c["volume"] for c in candles]

    returns = [
        (closes[i] - closes[i - 1]) / closes[i - 1] if closes[i - 1] != 0 else 0
        for i in range(1, len(closes))
    ]

    if len(returns) < 2:
        return np.array([0.0, 0.0, 0.0, 0.0]).reshape(1, -1)

    mean_return = float(np.mean(returns))
    volatility = float(np.std(returns))
    last_return = returns[-1]
    vol_trend = (volumes[-1] - volumes[0]) / (volumes[0] + 1e-10)

    return np.array([mean_return, volatility, last_return, vol_trend]).reshape(1, -1)


def _compute_trend_metrics(candles: list[dict]) -> dict:
    """Extra metrics for advice reasoning."""
    closes = [c["close"] for c in candles]
    if len(closes) < 3:
        return {"trend": "neutral", "strength": 0, "volatility_regime": "normal",
                "momentum": 0, "pct_change_24": 0}

    returns = [
        (closes[i] - closes[i - 1]) / closes[i - 1]
        for i in range(1, len(closes)) if closes[i - 1] != 0
    ]

    mean_ret = float(np.mean(returns))
    vol = float(np.std(returns))
    momentum = float(np.mean(returns[-min(5, len(returns)):]))  # short-term momentum

    # Trend direction
    if mean_ret > 0.001:
        trend = "bullish"
    elif mean_ret < -0.001:
        trend = "bearish"
    else:
        trend = "neutral"

    # Trend strength (0-1)
    strength = min(abs(mean_ret) / 0.01, 1.0)

    # Volatility regime
    if vol > 0.02:
        vol_regime = "high"
    elif vol > 0.008:
        vol_regime = "elevated"
    else:
        vol_regime = "normal"

    # 24-period change
    lookback = min(24, len(closes) - 1)
    pct_24 = (closes[-1] - closes[-lookback - 1]) / closes[-lookback - 1] * 100 if closes[-lookback - 1] != 0 else 0

    return {
        "trend": trend,
        "strength": round(strength, 3),
        "volatility_regime": vol_regime,
        "momentum": round(momentum, 6),
        "pct_change_24": round(pct_24, 3),
    }


# ── Model training ───────────────────────────────────────────────────────────

model: LogisticRegression | None = None

def _train_model() -> LogisticRegression:
    rng = random.Random(42)
    X_list, y_list = [], []

    for _ in range(2000):
        n = rng.randint(10, 50)
        price = 1000 + rng.random() * 4000
        candles = []
        for _ in range(n):
            ret = rng.gauss(0.0001, 0.012)
            new_price = price * (1 + ret)
            high = max(price, new_price) * (1 + rng.random() * 0.005)
            low = min(price, new_price) * (1 - rng.random() * 0.005)
            candles.append({
                "open": price, "high": high, "low": low,
                "close": new_price, "volume": rng.randint(50000, 500000),
            })
            price = new_price

        features = _compute_features(candles)
        future_return = rng.gauss(0.0001, 0.012)
        label = 1 if future_return > 0 else 0
        X_list.append(features.flatten())
        y_list.append(label)

    X = np.array(X_list)
    y = np.array(y_list)
    clf = LogisticRegression(max_iter=500)
    clf.fit(X, y)
    acc = clf.score(X, y)
    print(f"✅ Model trained on {len(X)} samples — accuracy: {acc:.3f}")
    return clf


@app.on_event("startup")
async def startup():
    global model
    model = _train_model()


# ── /predict ─────────────────────────────────────────────────────────────────

@app.post("/predict", response_model=PredictResponse)
async def predict(req: PredictRequest):
    candle_dicts = [c.model_dump() for c in req.candles]
    features = _compute_features(candle_dicts)

    prob = model.predict_proba(features)[0]  # type: ignore
    prob_down, prob_up = float(prob[0]), float(prob[1])

    closes = [c.close for c in req.candles]
    returns = [
        (closes[i] - closes[i - 1]) / closes[i - 1]
        for i in range(1, len(closes)) if closes[i - 1] != 0
    ]
    vol = float(np.std(returns)) if len(returns) > 1 else 0.01
    expected_move_pct = round(
        (prob_up - prob_down) * vol * 100 * math.sqrt(req.horizon_seconds / 60), 4
    )

    return PredictResponse(
        countryId=req.countryId,
        horizon_seconds=req.horizon_seconds,
        prob_up=round(prob_up, 4),
        prob_down=round(prob_down, 4),
        expected_move_pct=expected_move_pct,
    )


# ── /advice — human-like recommendation ─────────────────────────────────────

def _generate_reason(
    country_id: str, rec: str, confidence: float,
    trend: dict, prob_up: float, expected_move: float,
) -> str:
    """Generate a human-readable explanation for the recommendation."""
    parts: list[str] = []

    # Trend statement
    trend_desc = trend["trend"]
    strength_word = "strongly" if trend["strength"] > 0.6 else "moderately" if trend["strength"] > 0.3 else "slightly"
    parts.append(f"The market for {country_id} is {strength_word} {trend_desc}")

    # Volatility context
    vol_regime = trend["volatility_regime"]
    if vol_regime == "high":
        parts.append("with high volatility indicating significant uncertainty")
    elif vol_regime == "elevated":
        parts.append("with elevated volatility suggesting increased risk")
    else:
        parts.append("with stable price action")

    # Prediction reasoning
    if rec == "buy":
        parts.append(
            f"Our model sees a {prob_up*100:.1f}% probability of upward movement "
            f"with an expected move of {expected_move:+.3f}%"
        )
        if trend["momentum"] > 0:
            parts.append("supported by positive short-term momentum")
    elif rec == "sell":
        parts.append(
            f"Our model indicates a {(1-prob_up)*100:.1f}% probability of decline "
            f"with an expected move of {expected_move:+.3f}%"
        )
        if trend["momentum"] < 0:
            parts.append("reinforced by negative momentum in recent candles")
    else:
        parts.append(
            f"The probability split is near even ({prob_up*100:.1f}% up) "
            "making directional bets risky"
        )

    # 24-period context
    pct_24 = trend["pct_change_24"]
    if abs(pct_24) > 0.5:
        direction = "gained" if pct_24 > 0 else "lost"
        parts.append(f"Over the last 24 periods the index has {direction} {abs(pct_24):.2f}%")

    # Confidence qualifier
    if confidence < 0.4:
        parts.append("Note: confidence is low — consider a smaller position size")

    return ". ".join(parts) + "."


@app.post("/advice", response_model=AdviceResponse)
async def advice(req: AdviceRequest):
    if len(req.candles) < 3:
        return AdviceResponse(
            countryId=req.countryId,
            recommendation="hold",
            confidence=0.0,
            reason=f"Insufficient data for {req.countryId} — need at least 3 candles to generate advice.",
        )

    candle_dicts = [c.model_dump() for c in req.candles]
    features = _compute_features(candle_dicts)
    trend = _compute_trend_metrics(candle_dicts)

    prob = model.predict_proba(features)[0]  # type: ignore
    prob_down, prob_up = float(prob[0]), float(prob[1])

    closes = [c.close for c in req.candles]
    returns = [
        (closes[i] - closes[i - 1]) / closes[i - 1]
        for i in range(1, len(closes)) if closes[i - 1] != 0
    ]
    vol = float(np.std(returns)) if len(returns) > 1 else 0.01
    expected_move_pct = (prob_up - prob_down) * vol * 100 * math.sqrt(req.horizon_seconds / 60)

    # ── Decision logic ───────────────────────────────────────────────────
    # Combine model probability + trend + volatility
    trend_bias = 0.0
    if trend["trend"] == "bullish":
        trend_bias = 0.05 * trend["strength"]
    elif trend["trend"] == "bearish":
        trend_bias = -0.05 * trend["strength"]

    # Adjusted probability
    adj_prob_up = min(max(prob_up + trend_bias, 0.0), 1.0)

    # High volatility reduces confidence
    vol_penalty = 0.0
    if trend["volatility_regime"] == "high":
        vol_penalty = 0.15
    elif trend["volatility_regime"] == "elevated":
        vol_penalty = 0.07

    # Determine recommendation
    BUY_THRESHOLD = 0.55
    SELL_THRESHOLD = 0.45

    if adj_prob_up >= BUY_THRESHOLD:
        rec = "buy"
        confidence = min((adj_prob_up - 0.5) * 4, 1.0)  # scale 0.5-0.75 → 0-1
    elif adj_prob_up <= SELL_THRESHOLD:
        rec = "sell"
        confidence = min((0.5 - adj_prob_up) * 4, 1.0)
    else:
        rec = "hold"
        confidence = 1.0 - abs(adj_prob_up - 0.5) * 4  # highest when exactly 0.5

    confidence = max(0.0, round(confidence - vol_penalty, 3))

    reason = _generate_reason(
        req.countryId, rec, confidence, trend, prob_up, expected_move_pct
    )

    return AdviceResponse(
        countryId=req.countryId,
        recommendation=rec,
        confidence=confidence,
        reason=reason,
    )


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": model is not None}
