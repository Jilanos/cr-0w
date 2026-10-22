"""crow_prices: crow's own token price table and token normalization, per provider.

List prices in USD per million tokens (uncached input, output, cache read). They mirror the
public vendor list prices that cdx-manager 0.21.5 ships (reviewed PRICES_REVIEWED); crow keeps
its own copy so it never imports cdx internals. Update the table by hand with a new
PRICES_VERSION; CROW_TOKEN_PRICES (JSON: model -> {input, output[, cache_read]}) overrides it,
and so does cdx's public CDX_TOKEN_PRICES.

These are list-price estimates, not subscription charges. A model missing from the table is
unpriced (None), never charged a default tier, and never priced from another provider.
"""
import json, os

PRICES_VERSION = 1
PRICES_REVIEWED = "2026-10-22"
PRICES_SOURCE = "vendor list prices, as mirrored by cdx-manager 0.21.5"
CACHE_READ_MULTIPLIER = 0.1
CACHE_WRITE_MULTIPLIER = 1.25

TABLE = {
    "claude": {
        "claude-fable-5-1": {"input": 10.0, "output": 50.0, "cache_read": 0.25},
        "claude-mythos-5-1": {"input": 10.0, "output": 50.0, "cache_read": 0.25},
        "claude-opus-5-5": {"input": 4.0, "output": 20.0, "cache_read": 0.2},
        "claude-sonnet-5-5": {"input": 2.0, "output": 10.0, "cache_read": 0.1},
        "claude-haiku-5-5": {"input": 0.1, "output": 0.5, "cache_read": 0.01},
        "claude-fable-5": {"input": 10.0, "output": 50.0},
        "claude-mythos-5": {"input": 10.0, "output": 50.0},
        "claude-opus-5": {"input": 5.0, "output": 25.0},
        "claude-opus-4-8": {"input": 5.0, "output": 25.0},
        "claude-opus-4-7": {"input": 5.0, "output": 25.0},
        "claude-opus-4-6": {"input": 5.0, "output": 25.0},
        "claude-opus-4-5": {"input": 5.0, "output": 25.0},
        "claude-sonnet-5": {"input": 2.0, "output": 10.0},
        "claude-sonnet-4-6": {"input": 3.0, "output": 15.0},
        "claude-sonnet-4-5": {"input": 3.0, "output": 15.0},
        "claude-sonnet-4-5-20250929": {"input": 3.0, "output": 15.0},
        "claude-haiku-4-5": {"input": 1.0, "output": 5.0},
        "claude-haiku-4-5-20251001": {"input": 1.0, "output": 5.0},
    },
    "codex": {
        "gpt-6.1-sol": {"input": 2.0, "output": 10.0, "cache_read": 0.1},
        "gpt-6-sol": {"input": 2.0, "output": 10.0},
        "gpt-6-luna": {"input": 0.1, "output": 0.5},
        "gpt-6-astra": {"input": 10.0, "output": 50.0},
        "gpt-5.6": {"input": 4.0, "output": 20.0},
        "gpt-5.6-sol": {"input": 4.0, "output": 20.0},
        "gpt-5.6-terra": {"input": 2.0, "output": 12.0},
        "gpt-5.6-luna": {"input": 0.2, "output": 1.2},
        "gpt-5.5": {"input": 5.0, "output": 30.0},
        "gpt-5.4": {"input": 2.5, "output": 15.0},
        "gpt-5.4-mini": {"input": 0.75, "output": 4.5},
        "gpt-5.4-nano": {"input": 0.2, "output": 1.25},
        "gpt-5.3-codex": {"input": 1.75, "output": 14.0},
    },
}


def _overrides():
    out = {}
    for var in ("CDX_TOKEN_PRICES", "CROW_TOKEN_PRICES"):
        try:
            data = json.loads(os.environ.get(var) or "{}")
        except ValueError:
            continue
        if isinstance(data, dict):
            out.update({k: v for k, v in data.items() if isinstance(v, dict) and "input" in v and "output" in v})
    return out


def table(provider=None):
    """{model: rates} for one provider (or every provider), overrides applied."""
    base = {}
    for prov, models in TABLE.items():
        if provider in (None, prov):
            base.update(models)
    over = _overrides()
    if provider:
        over = {k: v for k, v in over.items() if provider_of(k) in (provider, None)}
    return {**base, **over}


def provider_of(model):
    m = (model or "").split("[", 1)[0]
    for prov, models in TABLE.items():
        if m in models:
            return prov
    if m.startswith("claude-"):
        return "claude"
    if m.startswith(("gpt-", "codex")) or (m[:1] == "o" and m[1:2].isdigit()):
        return "codex"
    return None


def rates(model, provider=None):
    m = (model or "").split("[", 1)[0]  # claude-opus-5-5[1m] bills at the base model's rates
    return table(provider).get(m)


def estimate_cost(usage, model, provider=None):
    """USD at list price for {input_tokens, cache_read_tokens, cache_creation_tokens, output_tokens}
    (input excludes cached reads), or None when the model is unknown."""
    r = rates(model, provider)
    if r is None or not isinstance(usage, dict):
        return None
    per_m = {"input_tokens": r["input"], "cache_read_tokens": r.get("cache_read", r["input"] * CACHE_READ_MULTIPLIER),
             "cache_creation_tokens": r["input"] * CACHE_WRITE_MULTIPLIER, "output_tokens": r["output"]}
    parts = [p * usage[k] for k, p in per_m.items() if usage.get(k) is not None]
    return sum(parts) / 1_000_000 if parts else None


def codex_usage(u):
    """An OpenAI usage object -> crow's categories. OpenAI input counts cached input and output
    counts reasoning output: both are subsets, split out here and never added twice."""
    u = u or {}
    inp, cached = u.get("input_tokens") or 0, u.get("cached_input_tokens") or 0
    return {"input_tokens": max(0, inp - cached), "cache_read_tokens": cached,
            "cache_creation_tokens": u.get("cache_write_input_tokens") or 0,
            "output_tokens": u.get("output_tokens") or 0,
            "reasoning_tokens": u.get("reasoning_output_tokens") or 0}


CODEX_KEYS = ("input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens",
              "reasoning_output_tokens")


def codex_delta(prev, total):
    """Tokens a cumulative snapshot adds over the previous one. A repeated snapshot adds nothing;
    a counter that went down (new thread) counts from zero again."""
    if prev is None:
        return {k: total.get(k) or 0 for k in CODEX_KEYS}
    if any((total.get(k) or 0) < (prev.get(k) or 0) for k in CODEX_KEYS):
        return {k: total.get(k) or 0 for k in CODEX_KEYS}
    return {k: (total.get(k) or 0) - (prev.get(k) or 0) for k in CODEX_KEYS}
