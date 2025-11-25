#!/usr/bin/env python3
"""
Chart Generator - Creates trading signal charts with zones and markers
Based on user's original tradde.py using mplfinance
"""

import sys
import json
import os
import pandas as pd
import numpy as np
import mplfinance as mpf
from datetime import datetime
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

# Set matplotlib to non-interactive backend
import matplotlib
matplotlib.use('Agg')

def generate_signal_chart(input_data: dict) -> dict:
    """
    Generate a trading signal chart with zones and markers.
    
    Args:
        input_data: Dictionary containing:
            - symbol: Trading symbol
            - timeframe: Timeframe (e.g., "1H", "4H")
            - candles: List of OHLCV data
            - signal: Entry signal info (direction, entry, sl, tp, confidence)
            - supply_zones: List of {top, bottom} dicts
            - demand_zones: List of {top, bottom} dicts
            - output_path: Where to save the PNG
    
    Returns:
        Dictionary with success status and file path
    """
    try:
        symbol = input_data.get('symbol', 'UNKNOWN')
        timeframe = input_data.get('timeframe', '')
        candles = input_data.get('candles', [])
        signal = input_data.get('signal', {})
        supply_zones = input_data.get('supply_zones', [])
        demand_zones = input_data.get('demand_zones', [])
        output_path = input_data.get('output_path', '/tmp/chart.png')
        
        if not candles:
            return {"success": False, "error": "No candle data provided"}
        
        # Convert candles to DataFrame
        df = pd.DataFrame(candles)
        df['Date'] = pd.to_datetime(df['date'])
        df.set_index('Date', inplace=True)
        df = df.rename(columns={
            'open': 'Open',
            'high': 'High', 
            'low': 'Low',
            'close': 'Close',
            'volume': 'Volume'
        })
        
        # Ensure correct column types
        for col in ['Open', 'High', 'Low', 'Close']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        
        df = df.dropna(subset=['Open', 'High', 'Low', 'Close'])
        
        if len(df) < 5:
            return {"success": False, "error": "Not enough candle data"}
        
        # Custom dark style
        mc = mpf.make_marketcolors(
            up='#22c55e',
            down='#ef4444',
            edge='inherit',
            wick='inherit',
            volume='in',
        )
        
        style = mpf.make_mpf_style(
            base_mpf_style='nightclouds',
            marketcolors=mc,
            gridstyle='-',
            gridcolor='#1f2937',
            facecolor='#0a0a0f',
            edgecolor='#1f2937',
            figcolor='#0a0a0f',
            rc={
                'axes.labelcolor': '#e5e7eb',
                'xtick.color': '#e5e7eb',
                'ytick.color': '#e5e7eb',
            }
        )
        
        # Create figure
        fig, axes = mpf.plot(
            df,
            type='candle',
            style=style,
            volume=False,
            returnfig=True,
            figsize=(14, 9),
            warn_too_much_data=False,
            tight_layout=True,
        )
        
        ax = axes[0]
        
        # Get y-axis range
        y_min, y_max = ax.get_ylim()
        
        # Draw zones
        for zone in supply_zones:
            top = float(zone.get('top', 0))
            bottom = float(zone.get('bottom', 0))
            if top > 0 and bottom > 0:
                rect = mpatches.Rectangle(
                    (ax.get_xlim()[0], bottom),
                    ax.get_xlim()[1] - ax.get_xlim()[0],
                    top - bottom,
                    linewidth=1,
                    edgecolor='#ef4444',
                    facecolor='#ef444433',
                    linestyle='--',
                    zorder=1
                )
                ax.add_patch(rect)
        
        for zone in demand_zones:
            top = float(zone.get('top', 0))
            bottom = float(zone.get('bottom', 0))
            if top > 0 and bottom > 0:
                rect = mpatches.Rectangle(
                    (ax.get_xlim()[0], bottom),
                    ax.get_xlim()[1] - ax.get_xlim()[0],
                    top - bottom,
                    linewidth=1,
                    edgecolor='#22c55e',
                    facecolor='#22c55e33',
                    linestyle='--',
                    zorder=1
                )
                ax.add_patch(rect)
        
        # Draw signal lines
        if signal:
            direction = signal.get('direction', '')
            entry = float(signal.get('entry', 0))
            sl = float(signal.get('stopLoss', 0))
            tp = float(signal.get('takeProfit', 0))
            confidence = signal.get('confidence', 0)
            
            x_min, x_max = ax.get_xlim()
            
            # Entry line
            if entry > 0:
                color = '#22c55e' if direction == 'BUY' else '#ef4444'
                ax.axhline(y=entry, color=color, linestyle='-', linewidth=2, alpha=0.8)
                ax.text(x_max, entry, f' {direction} @ {entry:.5f} ({confidence}%)', 
                       va='center', ha='left', color=color, fontsize=10, fontweight='bold')
            
            # Stop Loss line
            if sl > 0:
                ax.axhline(y=sl, color='#f59e0b', linestyle='--', linewidth=1.5, alpha=0.8)
                ax.text(x_max, sl, f' SL @ {sl:.5f}', 
                       va='center', ha='left', color='#f59e0b', fontsize=9)
            
            # Take Profit line  
            if tp > 0:
                ax.axhline(y=tp, color='#3b82f6', linestyle='--', linewidth=1.5, alpha=0.8)
                ax.text(x_max, tp, f' TP @ {tp:.5f}', 
                       va='center', ha='left', color='#3b82f6', fontsize=9)
        
        # Title
        title = f'{symbol} - {timeframe}'
        timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
        ax.set_title(f'{title}\n{timestamp}', fontsize=14, fontweight='bold', color='#e5e7eb', pad=10)
        
        # Add legend for zones
        legend_elements = [
            mpatches.Patch(facecolor='#ef444433', edgecolor='#ef4444', label='Supply Zone'),
            mpatches.Patch(facecolor='#22c55e33', edgecolor='#22c55e', label='Demand Zone'),
        ]
        ax.legend(handles=legend_elements, loc='upper left', fontsize=9, 
                 facecolor='#1f2937', edgecolor='#374151', labelcolor='#e5e7eb')
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
        
        # Save figure
        fig.savefig(output_path, dpi=150, bbox_inches='tight', facecolor='#0a0a0f', edgecolor='none')
        plt.close(fig)
        
        return {"success": True, "path": output_path}
        
    except Exception as e:
        return {"success": False, "error": str(e)}


def main():
    """Main entry point - reads JSON from stdin, outputs JSON to stdout"""
    try:
        # Read input from stdin
        input_str = sys.stdin.read()
        if not input_str.strip():
            print(json.dumps({"success": False, "error": "No input provided"}))
            return
        
        input_data = json.loads(input_str)
        result = generate_signal_chart(input_data)
        print(json.dumps(result))
        
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON: {e}"}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))


if __name__ == "__main__":
    main()
