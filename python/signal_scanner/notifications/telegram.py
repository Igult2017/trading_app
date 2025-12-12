"""
Telegram notification service for trading signals.
"""

import asyncio
from typing import Optional
from datetime import datetime

from ..types import StrategySignal
from ..config import telegram_config
from ..logging_config import get_logger

logger = get_logger("telegram")


class TelegramNotifier:
    """
    Sends trading signal notifications via Telegram.
    """
    
    def __init__(self):
        self.enabled = telegram_config.enabled
        self.bot_token = telegram_config.bot_token
        self.chat_id = telegram_config.chat_id
        self._bot = None
    
    def _get_bot(self):
        """Lazy-initialize the Telegram bot."""
        if self._bot is None and self.enabled:
            try:
                import telegram
                self._bot = telegram.Bot(token=self.bot_token)
            except Exception as e:
                logger.error(f"Failed to initialize Telegram bot: {e}")
                self.enabled = False
        return self._bot
    
    async def send_signal(
        self,
        signal: StrategySignal,
        chart_path: Optional[str] = None
    ) -> bool:
        """
        Send a trading signal notification.
        
        Args:
            signal: The trading signal to send
            chart_path: Optional path to chart image
            
        Returns:
            True if sent successfully
        """
        if not self.enabled:
            logger.info("Telegram disabled, notification not sent")
            return False
        
        bot = self._get_bot()
        if not bot:
            return False
        
        try:
            message = self._format_signal_message(signal)
            
            loop = asyncio.get_event_loop()
            
            if chart_path:
                await loop.run_in_executor(
                    None,
                    lambda: bot.send_photo(
                        chat_id=self.chat_id,
                        photo=open(chart_path, "rb"),
                        caption=message,
                        parse_mode="HTML"
                    )
                )
            else:
                await loop.run_in_executor(
                    None,
                    lambda: bot.send_message(
                        chat_id=self.chat_id,
                        text=message,
                        parse_mode="HTML"
                    )
                )
            
            logger.info(f"Telegram notification sent for {signal.symbol}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send Telegram notification: {e}")
            return False
    
    def _format_signal_message(self, signal: StrategySignal) -> str:
        """Format signal as Telegram message."""
        direction_emoji = "BUY" if signal.direction.value == "buy" else "SELL"
        direction_icon = "+" if signal.direction.value == "buy" else "-"
        
        context = signal.market_context
        setup = signal.entry_setup
        
        risk_pips = abs(signal.entry_price - signal.stop_loss)
        reward_pips = abs(signal.take_profit - signal.entry_price)
        
        message = f"""<b>{direction_emoji} {signal.symbol}</b>

<b>Strategy:</b> {signal.strategy_name}
<b>Confidence:</b> {signal.confidence}%
<b>Timeframe:</b> {signal.timeframe}

<b>Entry:</b> {signal.entry_price:.5f}
<b>Stop Loss:</b> {signal.stop_loss:.5f}
<b>Take Profit:</b> {signal.take_profit:.5f}

<b>Risk:Reward:</b> 1:{signal.risk_reward_ratio:.1f}

<b>Entry Type:</b> {setup.entry_type.value.replace('_', ' ').title()}
<b>HTF Trend:</b> {context.h4_trend_direction.value.title()}
<b>Zone:</b> {setup.entry_zone.type.value.title()}

<b>Confirmations:</b>
{chr(10).join(f"- {c}" for c in setup.confirmations[:5])}

<i>Signal generated at {datetime.now().strftime('%H:%M UTC')}</i>
<i>Expires in 4 hours</i>"""

        return message
    
    async def send_text(self, message: str) -> bool:
        """Send a simple text message."""
        if not self.enabled:
            return False
        
        bot = self._get_bot()
        if not bot:
            return False
        
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: bot.send_message(
                    chat_id=self.chat_id,
                    text=message,
                    parse_mode="HTML"
                )
            )
            return True
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
            return False


telegram_notifier = TelegramNotifier()


async def send_signal_notification(
    signal: StrategySignal,
    chart_path: Optional[str] = None
) -> bool:
    """Convenience function to send signal notification."""
    return await telegram_notifier.send_signal(signal, chart_path)
