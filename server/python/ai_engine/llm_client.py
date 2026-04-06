"""
ai_engine/llm_client.py
Thin bridge to the Gemini API (google-genai SDK).
Receives a structured prompt dict and returns a plain-text response string.
All LLM-specific wiring is isolated here.

Requires:
    GEMINI_API_KEY environment variable
    pip install google-genai
"""
from __future__ import annotations
import os
import json

MODEL = "gemini-2.5-pro"


def _api_key() -> str:
    """Resolve the Gemini API key — accepts either env var name."""
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or ""
    if not key:
        raise RuntimeError(
            "Gemini API key not found. Set GEMINI_API_KEY or GOOGLE_API_KEY "
            "in your environment before starting the server."
        )
    return key


def _client():
    """Lazy import so the rest of the engine works without google-genai installed."""
    from google import genai  # type: ignore
    return genai.Client(api_key=_api_key())


# ── System instruction ────────────────────────────────────────────────────────

SYSTEM_INSTRUCTION = (
    "You are a professional trading coach and performance analyst. "
    "You receive structured trade data and pre-computed statistical findings. "
    "Your role is to synthesise these findings into clear, actionable insights. "
    "Rules:\n"
    "1. NEVER invent patterns not supported by the provided data.\n"
    "2. If data is labelled INSUFFICIENT, say so and explain what data is needed.\n"
    "3. Be direct, concise, and evidence-based. Cite sample sizes.\n"
    "4. Avoid generic trading advice — speak only about this trader's actual record.\n"
    "5. Use plain English. No bullet-point padding."
)


# ── Prompt builders ───────────────────────────────────────────────────────────

def _build_analysis_prompt(payload: dict) -> str:
    return (
        "You are analysing a trader's full history. "
        "Below are pre-computed findings from their trade data. "
        "Write a cohesive performance report covering:\n"
        "- Overall health and trader archetype\n"
        "- Their strongest and weakest edges (backed by evidence)\n"
        "- Behavioural patterns (emotions, FOMO, revenge trades)\n"
        "- A pre-trade checklist derived from their winning trades\n"
        "- One clear risk alert if any drain pattern is severe\n\n"
        f"DATA:\n{json.dumps(payload, indent=2)}"
    )


def _build_qa_prompt(question: str, local_answer: str, payload: dict) -> str:
    if local_answer:
        return (
            f"The trader asked: \"{question}\"\n\n"
            f"Pre-computed answer from trade data:\n{local_answer}\n\n"
            "Interpret this answer conversationally in 2–4 sentences. "
            "Do not add information not present above."
        )
    return (
        f"The trader asked: \"{question}\"\n\n"
        f"Trade data summary:\n{json.dumps(payload, indent=2)}\n\n"
        "Answer the question using only the data above. "
        "If the data does not support an answer, say so explicitly."
    )


def _build_strategy_prompt(payload: dict) -> str:
    return (
        "Based on the strategy analysis below, write a concise trading strategy brief:\n"
        "- Entry conditions (with win rates and sample sizes)\n"
        "- Conditions to avoid (with loss rates)\n"
        "- Risk rules\n"
        "- Any data warnings\n\n"
        "Do not add conditions not present in the data.\n\n"
        f"STRATEGY DATA:\n{json.dumps(payload, indent=2)}"
    )


# ── Main entry point ──────────────────────────────────────────────────────────

def call_llm(mode: str, payload: dict, question: str = "") -> str:
    """
    Call Gemini and return the response as a plain string.
    mode: "analysis" | "qa" | "strategy"
    payload: serialisable dict of pre-computed findings
    question: only used in qa mode
    """
    from google.genai import types  # type: ignore

    if mode == "analysis":
        user_content = _build_analysis_prompt(payload)
    elif mode == "qa":
        local_answer = payload.pop("_local_answer", "")
        user_content = _build_qa_prompt(question, local_answer, payload)
    elif mode == "strategy":
        user_content = _build_strategy_prompt(payload)
    else:
        return f"Unknown mode: {mode}"

    client = _client()

    response = client.models.generate_content(
        model=MODEL,
        contents=user_content,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            temperature=0.3,
        ),
    )

    return response.text or ""
