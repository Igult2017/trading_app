"""
Canonical normalised trade signal shared across all services.
Every signal source (MT5 monitor, Telegram parser) produces this format
before publishing to the Redis queue.
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Optional
import json
import uuid


@dataclass
class NormalisedSignal:
    """The single canonical format that every signal source must produce."""
    source:      str                  # "mt5" | "telegram"
    symbol:      str                  # "EURUSD"
    action:      str                  # "BUY" | "SELL"
    event_type:  str                  # "OPEN" | "MODIFY" | "CLOSE"
    trade_id:    str                  # unique — master ticket or message id
    master_id:   str                  # UUID of the copy_masters row

    volume:      Optional[float] = None
    entry_price: Optional[float] = None
    stop_loss:   Optional[float] = None
    take_profit: Optional[float] = None
    closed_price: Optional[float] = None
    raw_payload: Optional[dict]  = field(default_factory=dict)

    # populated by worker after DB insert
    master_trade_db_id: Optional[str] = None

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, data: str) -> "NormalisedSignal":
        return cls(**json.loads(data))

    @classmethod
    def new_id(cls) -> str:
        return str(uuid.uuid4())
