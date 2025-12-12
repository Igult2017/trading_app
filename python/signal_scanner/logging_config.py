"""
Structured logging configuration for the signal scanner.
Provides consistent, parseable log output across all modules.
"""

import logging
import sys
from datetime import datetime
from typing import Any, Dict, Optional
import json


class StructuredFormatter(logging.Formatter):
    """Custom formatter that outputs structured JSON logs."""
    
    def format(self, record: logging.LogRecord) -> str:
        log_data: Dict[str, Any] = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "module": record.name,
            "message": record.getMessage(),
        }
        
        if hasattr(record, "symbol"):
            log_data["symbol"] = record.symbol
        if hasattr(record, "strategy"):
            log_data["strategy"] = record.strategy
        if hasattr(record, "confidence"):
            log_data["confidence"] = record.confidence
        if hasattr(record, "direction"):
            log_data["direction"] = record.direction
        if hasattr(record, "extra_data"):
            log_data["data"] = record.extra_data
            
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
            
        return json.dumps(log_data)


class ConsoleFormatter(logging.Formatter):
    """Human-readable console formatter with colors."""
    
    COLORS = {
        "DEBUG": "\033[36m",     # Cyan
        "INFO": "\033[32m",      # Green
        "WARNING": "\033[33m",   # Yellow
        "ERROR": "\033[31m",     # Red
        "CRITICAL": "\033[35m",  # Magenta
    }
    RESET = "\033[0m"
    
    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, "")
        prefix = f"[{record.name}]"
        
        extra_info = ""
        if hasattr(record, "symbol"):
            extra_info += f" {record.symbol}"
        if hasattr(record, "confidence"):
            extra_info += f" ({record.confidence}%)"
            
        message = record.getMessage()
        
        return f"{color}{record.levelname:8}{self.RESET} {prefix}{extra_info} {message}"


def get_logger(name: str, structured: bool = False) -> logging.Logger:
    """
    Get a configured logger for the given module name.
    
    Args:
        name: Module name for the logger
        structured: If True, outputs JSON logs; otherwise human-readable
        
    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(f"signal_scanner.{name}")
    
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        
        if structured:
            handler.setFormatter(StructuredFormatter())
        else:
            handler.setFormatter(ConsoleFormatter())
            
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        
    return logger


class LoggerAdapter(logging.LoggerAdapter):
    """Adapter that adds context to log messages."""
    
    def process(self, msg: str, kwargs: Dict[str, Any]) -> tuple:
        extra = kwargs.get("extra", {})
        extra.update(self.extra)
        kwargs["extra"] = extra
        return msg, kwargs


def get_context_logger(name: str, **context) -> LoggerAdapter:
    """
    Get a logger with persistent context (e.g., symbol, strategy).
    
    Args:
        name: Module name for the logger
        **context: Key-value pairs to include in every log message
        
    Returns:
        Logger adapter with context
    """
    base_logger = get_logger(name)
    return LoggerAdapter(base_logger, context)
