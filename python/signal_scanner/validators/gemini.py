"""
Gemini AI signal validation.
Uses Google's Gemini model to validate trading signals.
"""

import json
import asyncio
from typing import Optional, List
from dataclasses import dataclass

from ..types import StrategySignal, GeminiValidation, MultiTimeframeData
from ..config import gemini_config
from ..logging_config import get_logger

logger = get_logger("gemini_validator")


class GeminiValidator:
    """
    Validates trading signals using Google Gemini AI.
    
    The AI reviews:
    - Trend alignment
    - Zone validity
    - Entry timing
    - Risk/reward assessment
    """
    
    def __init__(self):
        self.enabled = gemini_config.enabled
        self.model = gemini_config.model
        self._client = None
    
    def _get_client(self):
        """Lazy-initialize the Gemini client."""
        if self._client is None and self.enabled:
            try:
                from google import genai
                self._client = genai.Client(api_key=gemini_config.api_key)
            except Exception as e:
                logger.error(f"Failed to initialize Gemini client: {e}")
                self.enabled = False
        return self._client
    
    async def validate(
        self,
        signal: StrategySignal,
        mtf_data: Optional[MultiTimeframeData] = None
    ) -> Optional[GeminiValidation]:
        """
        Validate a trading signal with Gemini AI.
        
        Args:
            signal: The signal to validate
            mtf_data: Optional multi-timeframe data for context
            
        Returns:
            GeminiValidation result or None if validation not available
        """
        if not self.enabled:
            logger.info("Gemini validation disabled, skipping")
            return None
        
        client = self._get_client()
        if not client:
            return None
        
        try:
            prompt = self._build_validation_prompt(signal)
            
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: client.models.generate_content(
                    model=self.model,
                    contents=prompt
                )
            )
            
            return self._parse_response(response.text)
            
        except Exception as e:
            logger.error(f"Gemini validation failed: {e}")
            return None
    
    def _build_validation_prompt(self, signal: StrategySignal) -> str:
        """Build the validation prompt for Gemini."""
        context = signal.market_context
        setup = signal.entry_setup
        
        prompt = f"""You are an expert trading signal validator. Analyze this trading signal and provide validation.

=== SIGNAL DETAILS ===
Symbol: {signal.symbol}
Direction: {signal.direction.value.upper()}
Timeframe: {signal.timeframe}
Entry Price: {signal.entry_price:.5f}
Stop Loss: {signal.stop_loss:.5f}
Take Profit: {signal.take_profit:.5f}
Risk:Reward: 1:{signal.risk_reward_ratio:.2f}
Current Confidence: {signal.confidence}%

=== MARKET CONTEXT ===
H4 Trend: {context.h4_trend_direction.value}
Entry Type: {setup.entry_type.value}
Zone Type: {setup.entry_zone.type.value}

=== CONFIRMATIONS ===
{chr(10).join(f"- {c}" for c in setup.confirmations)}

=== ANALYSIS REASONING ===
{chr(10).join(f"- {r}" for r in signal.reasoning[:10])}

=== VALIDATION RULES ===
1. NEVER trade against the higher timeframe trend unless there's a confirmed CHoCH
2. Skip signals in unclear/choppy markets
3. Verify the zone is valid and unmitigated
4. Check if entry timing makes sense
5. Assess if R:R is realistic given market structure

Respond in this exact JSON format:
{{
    "validated": true/false,
    "confidence_adjustment": -20 to +20,
    "concerns": ["list of concerns if any"],
    "strengths": ["list of strengths"],
    "recommendation": "proceed" | "caution" | "skip",
    "reasoning": "brief explanation"
}}

Only respond with the JSON, no other text."""

        return prompt
    
    def _parse_response(self, response_text: str) -> Optional[GeminiValidation]:
        """Parse Gemini's response into GeminiValidation."""
        try:
            text = response_text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            
            data = json.loads(text)
            
            return GeminiValidation(
                validated=data.get("validated", False),
                confidence_adjustment=data.get("confidence_adjustment", 0),
                concerns=data.get("concerns", []),
                strengths=data.get("strengths", []),
                recommendation=data.get("recommendation", "caution"),
                reasoning=data.get("reasoning", "")
            )
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini response: {e}")
            logger.debug(f"Raw response: {response_text[:500]}")
            return None


gemini_validator = GeminiValidator()


async def validate_signal(
    signal: StrategySignal,
    mtf_data: Optional[MultiTimeframeData] = None
) -> Optional[GeminiValidation]:
    """Convenience function to validate a signal."""
    return await gemini_validator.validate(signal, mtf_data)
