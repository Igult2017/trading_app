"""
SQLAlchemy models for the tables the copy engine reads/writes.
Mirrors shared/schema.ts — only the columns we actually touch.
"""
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Boolean, Integer, \
    Numeric, Text, DateTime, JSON
from sqlalchemy.orm import declarative_base, sessionmaker
from config import DATABASE_URL

engine  = create_engine(DATABASE_URL, pool_pre_ping=True)
# expire_on_commit=False keeps attributes accessible after the session closes
# (prevents DetachedInstanceError when objects are used outside the with-block)
Session = sessionmaker(engine, expire_on_commit=False)
Base    = declarative_base()


class BrokerAccount(Base):
    __tablename__ = "broker_accounts"
    id             = Column(String, primary_key=True)
    user_id        = Column(String, nullable=False)
    name           = Column(Text)
    login_id       = Column(Text)
    password_enc   = Column(Text)   # AES-256-GCM — contains accessToken, refreshToken, ctraderId
    platform       = Column(Text)
    account_type   = Column(Text)   # demo | live | funded
    connection_type= Column(Text)   # api | webhook
    server         = Column(Text)   # broker API URL (DXTrade) or server name (TradeLocker/MT4/5)
    is_active      = Column(Boolean)
    sync_status    = Column(Text)
    balance        = Column(Numeric)   # last-known account balance (refreshed by Node)
    equity         = Column(Numeric)   # last-known equity (balance ± floating P/L)


class CopyMaster(Base):
    __tablename__ = "copy_masters"
    id                = Column(String, primary_key=True)
    user_id           = Column(String)
    broker_account_id = Column(String)   # → broker_accounts.id
    source_type       = Column(Text)     # ctrader | binance | bybit | ...
    strategy_name     = Column(Text)
    is_public         = Column(Boolean)
    is_active         = Column(Boolean)


class CopyFollower(Base):
    __tablename__ = "copy_followers"
    id                = Column(String, primary_key=True)
    user_id           = Column(String)
    broker_account_id = Column(String)   # → broker_accounts.id
    master_id         = Column(String)
    lot_mode          = Column(Text)     # mult | fixed | risk
    lot_multiplier    = Column(Numeric)
    fixed_lot         = Column(Numeric)
    risk_percent      = Column(Numeric)
    direction         = Column(Text)     # same | reverse | hedge
    symbol_whitelist  = Column(JSON)
    symbol_blacklist  = Column(JSON)
    max_open_trades   = Column(Integer)
    trade_delay_sec   = Column(Integer)
    pause_inactive    = Column(Boolean)
    pause_on_dd       = Column(Boolean)
    max_dd_percent    = Column(Numeric)
    max_daily_loss    = Column(Numeric)
    is_active         = Column(Boolean)
    risk_accepted     = Column(Boolean)


class CopyTradeMaster(Base):
    __tablename__ = "copy_trades_master"
    id          = Column(String, primary_key=True)
    master_id   = Column(String)
    external_id = Column(Text)   # positionId from broker
    source      = Column(Text)
    symbol      = Column(Text)
    action      = Column(Text)   # BUY | SELL
    event_type  = Column(Text)   # OPEN | MODIFY | CLOSE
    volume      = Column(Numeric)
    entry_price = Column(Numeric)
    stop_loss   = Column(Numeric)
    take_profit = Column(Numeric)
    closed_price= Column(Numeric)
    raw_payload = Column(JSON)
    status      = Column(Text)
    created_at  = Column(DateTime, default=datetime.utcnow)


class CopyTradeFollower(Base):
    __tablename__ = "copy_trades_follower"
    id              = Column(String, primary_key=True)
    master_trade_id = Column(String)
    follower_id     = Column(String)
    external_id     = Column(Text)
    symbol          = Column(Text)
    action          = Column(Text)
    event_type      = Column(Text)
    volume          = Column(Numeric)
    entry_price     = Column(Numeric)
    stop_loss       = Column(Numeric)
    take_profit     = Column(Numeric)
    closed_price    = Column(Numeric)
    status          = Column(Text)   # pending | executed | failed | skipped
    error_message   = Column(Text)
    retry_count     = Column(Integer, default=0)
    executed_at     = Column(DateTime)
    created_at      = Column(DateTime, default=datetime.utcnow)


class CopyExecutionLog(Base):
    __tablename__ = "copy_execution_logs"
    id          = Column(String, primary_key=True)
    follower_id = Column(String)
    trade_id    = Column(String)
    level       = Column(Text)   # INFO | WARN | ERROR
    event       = Column(Text)   # OPEN | CLOSE | MODIFY | SKIP | RETRY | FAIL
    message     = Column(Text)
    meta        = Column("metadata", JSON)   # 'metadata' is reserved on the ORM base; map via attr 'meta'
    created_at  = Column(DateTime, default=datetime.utcnow)
