"""
ai_engine/notes.py
NLP pipeline on manualFields JSONB.
Produces keyword correlations, emotion stats, red-flag phrase detection,
and behavioral flag analysis — all without external NLP libraries.
"""
from __future__ import annotations
import re
from collections import Counter, defaultdict

from ._models import (
    Confidence, NotesSummary, KeywordStat, EmotionStat, ProofedFinding,
    MIN_TRADES_LOW,
)
from ._utils import (
    extract_manual, is_win, is_loss, win_rate as global_win_rate,
    confidence_level, is_sufficient, safe_div, coerce_bool, coerce_str,
)

# ── Vocabulary ────────────────────────────────────────────────────────────────

WIN_WORDS: frozenset[str] = frozenset({
    "waited", "confirmed", "clear", "planned", "patient", "aligned",
    "disciplined", "structured", "calm", "selective", "prepared",
    "systematic", "controlled", "methodical", "confident", "objective",
})

LOSS_WORDS: frozenset[str] = frozenset({
    "forced", "fomo", "felt", "hope", "quick", "rush", "revenge",
    "impulsive", "chased", "overtraded", "emotional", "random",
    "ignored", "deviated", "bored", "anxious", "frustrated", "fear",
})

RED_FLAG_PHRASES: list[str] = [
    "feels right", "just this once", "should work", "gut feeling",
    "too good to miss", "make it back", "one more trade", "probably fine",
    "cant go wrong", "can't go wrong", "nothing to lose", "easy money",
]

# Fields to scan for text
TEXT_FIELDS: tuple[str, ...] = (
    "thesis", "trigger", "invalidationLogic", "expectedBehavior",
    "whatWorked", "whatFailed", "adjustments", "notes",
)

# Behavioral bool flags → human-readable label
BOOL_FLAGS: dict[str, str] = {
    "fomoTrade":    "FOMO entry",
    "revengeTrade": "Revenge trade",
    "boredomTrade": "Boredom trade",
    "ruleBroken":   "Rule broken",
}

# Emotion field name
EMOTION_FIELD = "emotionalState"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z]+", text.lower())


def _get_text(manual: dict) -> str:
    parts = [coerce_str(manual.get(f)) for f in TEXT_FIELDS]
    return " ".join(p for p in parts if p)


def _keyword_stat(
    keyword: str,
    wins_with: int,
    losses_with: int,
    total_with: int,
) -> KeywordStat:
    wr = safe_div(wins_with, total_with)
    return KeywordStat(
        keyword=keyword,
        occurrences=total_with,
        count_win=wins_with,
        count_loss=losses_with,
        win_rate=round(wr, 4),
    )


# ── Main pipeline ─────────────────────────────────────────────────────────────

def analyze_notes(trades: list[dict]) -> NotesSummary:
    total = len(trades)
    baseline_wr = global_win_rate(trades)

    # ── Coverage ──────────────────────────────────────────────────────────────
    no_note: list[dict] = []
    has_note: list[dict] = []
    for t in trades:
        m = extract_manual(t)
        if _get_text(m).strip():
            has_note.append(t)
        else:
            no_note.append(t)

    coverage_pct = round(safe_div(len(has_note), total) * 100, 1)
    blind_loss_pct = round(
        safe_div(sum(1 for t in no_note if is_loss(t)), len(no_note)) * 100, 1
    ) if no_note else 0.0

    # ── Keyword correlation ───────────────────────────────────────────────────
    # For each word: track wins and losses it appeared in
    word_wins:   Counter[str] = Counter()
    word_losses: Counter[str] = Counter()

    for t in trades:
        m   = extract_manual(t)
        tokens = set(_tokenize(_get_text(m)))
        if is_win(t):
            word_wins.update(tokens)
        elif is_loss(t):
            word_losses.update(tokens)

    def _build_stats(vocab: frozenset[str]) -> list[KeywordStat]:
        stats: list[KeywordStat] = []
        for w in vocab:
            n_win  = word_wins[w]
            n_loss = word_losses[w]
            n      = n_win + n_loss
            if is_sufficient(n):
                stats.append(_keyword_stat(w, n_win, n_loss, n))
        stats.sort(key=lambda s: s.win_rate, reverse=True)
        return stats

    win_keywords  = _build_stats(WIN_WORDS)
    loss_keywords = sorted(_build_stats(LOSS_WORDS), key=lambda s: s.win_rate)

    # ── Red-flag phrases ──────────────────────────────────────────────────────
    red_flags: list[KeywordStat] = []
    for phrase in RED_FLAG_PHRASES:
        n_win = n_loss = 0
        for t in trades:
            m = extract_manual(t)
            if phrase in _get_text(m).lower():
                if is_win(t):
                    n_win += 1
                else:
                    n_loss += 1
        n = n_win + n_loss
        if is_sufficient(n):
            red_flags.append(_keyword_stat(phrase, n_win, n_loss, n))
    red_flags.sort(key=lambda s: s.win_rate)

    # ── Emotion correlation ───────────────────────────────────────────────────
    emotion_buckets: dict[str, list[dict]] = defaultdict(list)
    for t in trades:
        m = extract_manual(t)
        emotion = coerce_str(m.get(EMOTION_FIELD)).strip().lower()
        if emotion:
            emotion_buckets[emotion].append(t)

    emotion_stats: list[EmotionStat] = []
    for emotion, group in emotion_buckets.items():
        n = len(group)
        if is_sufficient(n):
            emotion_stats.append(EmotionStat(
                emotion=emotion,
                count=n,
                win_rate=round(global_win_rate(group), 4),
                pct_of_total=round(safe_div(n, total) * 100, 1),
            ))
    emotion_stats.sort(key=lambda e: e.win_rate, reverse=True)

    # ── Behavioral flags ──────────────────────────────────────────────────────
    behavioral_flags: dict[str, ProofedFinding] = {}
    for field_name, label in BOOL_FLAGS.items():
        flagged = [
            t for t in trades
            if coerce_bool(extract_manual(t).get(field_name)) is True
        ]
        n = len(flagged)
        if is_sufficient(n):
            wr = global_win_rate(flagged)
            behavioral_flags[field_name] = ProofedFinding(
                finding=f"{label} detected in {n} trades",
                sample_size=n,
                win_rate=round(wr, 4),
                baseline_wr=round(baseline_wr, 4),
                deviation=round(wr - baseline_wr, 4),
                confidence=confidence_level(n),
            )

    return NotesSummary(
        coverage_pct=coverage_pct,
        blind_spot_loss_pct=blind_loss_pct,
        win_keywords=win_keywords,
        loss_keywords=loss_keywords,
        red_flags=red_flags,
        emotion_correlation=emotion_stats,
        behavioral_flags=behavioral_flags,
    )
