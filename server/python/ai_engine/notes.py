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
    SessionEmotionFinding, MIN_TRADES_LOW,
)
from ._utils import (
    extract_manual, is_win, is_loss, win_rate as global_win_rate,
    confidence_level, is_sufficient, safe_div, coerce_bool, coerce_str,
)

# ── Fixed seed vocabulary ─────────────────────────────────────────────────────

_SEED_WIN_WORDS: frozenset[str] = frozenset({
    "waited", "confirmed", "clear", "planned", "patient", "aligned",
    "disciplined", "structured", "calm", "selective", "prepared",
    "systematic", "controlled", "methodical", "confident", "objective",
})

_SEED_LOSS_WORDS: frozenset[str] = frozenset({
    "forced", "fomo", "felt", "hope", "quick", "rush", "revenge",
    "impulsive", "chased", "overtraded", "emotional", "random",
    "ignored", "deviated", "bored", "anxious", "frustrated", "fear",
})

# Stop words to exclude from dynamic vocabulary
_STOP_WORDS: frozenset[str] = frozenset({
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to",
    "for", "of", "with", "by", "from", "as", "is", "was", "are",
    "were", "be", "been", "being", "have", "has", "had", "do",
    "does", "did", "will", "would", "could", "should", "may", "might",
    "i", "my", "me", "we", "it", "this", "that", "there", "then",
    "so", "no", "not", "very", "too", "just", "also", "like",
    "price", "trade", "entry", "exit", "market", "stop", "target",
    "candle", "level", "zone", "time", "set", "up", "down", "put",
    "got", "get", "went", "go", "came", "come",
})


def _build_dynamic_vocabulary(
    word_wins: "Counter[str]",
    word_losses: "Counter[str]",
    min_occurrences: int = 3,
    top_n: int = 30,
) -> tuple[frozenset[str], frozenset[str]]:
    """
    Compute dynamic vocabulary from this trader's own notes.
    Words that appear disproportionately more in wins become "win words",
    and vice versa for losses.

    Returns (dynamic_win_words, dynamic_loss_words) as frozensets.
    """
    all_words = set(word_wins.keys()) | set(word_losses.keys())
    win_biased:  list[tuple[float, str]] = []
    loss_biased: list[tuple[float, str]] = []

    for word in all_words:
        if word in _STOP_WORDS or len(word) < 4:
            continue
        n_win  = word_wins[word]
        n_loss = word_losses[word]
        total  = n_win + n_loss
        if total < min_occurrences:
            continue
        wr = n_win / total
        # Bias score: how far from 50/50
        if wr >= 0.65:
            win_biased.append((wr, word))
        elif wr <= 0.35:
            loss_biased.append((wr, word))

    win_biased.sort(reverse=True)
    loss_biased.sort()

    dyn_win  = frozenset(w for _, w in win_biased[:top_n])
    dyn_loss = frozenset(w for _, w in loss_biased[:top_n])
    return dyn_win, dyn_loss

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

    # Build dynamic vocabulary from this trader's own notes
    dyn_win_words, dyn_loss_words = _build_dynamic_vocabulary(word_wins, word_losses)

    # Merge seed + dynamic vocabularies
    WIN_WORDS  = _SEED_WIN_WORDS  | dyn_win_words
    LOSS_WORDS = _SEED_LOSS_WORDS | dyn_loss_words

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

    # ── Session phase × emotion matrix ───────────────────────────────────────
    # Dedicated cross-tab of (sessionPhase, emotionalState) — surfaces the
    # specific mood+timing combinations that predict performance.
    sp_em_buckets: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for t in trades:
        m       = extract_manual(t)
        phase   = coerce_str(t.get("sessionPhase")).strip().lower()
        emotion = coerce_str(m.get(EMOTION_FIELD)).strip().lower()
        if phase and emotion:
            sp_em_buckets[(phase, emotion)].append(t)

    session_emotion_matrix: list = []
    for (phase, emotion), group in sp_em_buckets.items():
        n = len(group)
        if not is_sufficient(n):
            continue
        wr  = global_win_rate(group)
        dev = wr - baseline_wr
        conf = confidence_level(n)
        sign = "+" if dev >= 0 else ""
        session_emotion_matrix.append(
            SessionEmotionFinding(
                session_phase=phase,
                emotion=emotion,
                win_rate=round(wr, 4),
                baseline_wr=round(baseline_wr, 4),
                deviation=round(dev, 4),
                sample_size=n,
                confidence=conf,
                label=(
                    f"{phase.title()} + {emotion.title()}: "
                    f"{wr:.0%} WR across {n} trades "
                    f"({sign}{dev:.0%} vs baseline, {conf})"
                ),
            )
        )
    # Sort: best combinations first
    session_emotion_matrix.sort(key=lambda x: x.win_rate, reverse=True)

    return NotesSummary(
        coverage_pct=coverage_pct,
        blind_spot_loss_pct=blind_loss_pct,
        win_keywords=win_keywords,
        loss_keywords=loss_keywords,
        red_flags=red_flags,
        emotion_correlation=emotion_stats,
        behavioral_flags=behavioral_flags,
        session_emotion_matrix=session_emotion_matrix,
    )
