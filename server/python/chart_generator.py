#!/usr/bin/env python3
"""
Chart Generator - Creates trading signal charts with zones, markers, and reasoning
Enhanced version with detailed zone annotations and entry confirmations
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
from matplotlib.lines import Line2D

import matplotlib
matplotlib.use('Agg')

def generate_signal_chart(input_data: dict) -> dict:
    """
    Generate a professional trading signal chart with zones and reasoning.
    
    Args:
        input_data: Dictionary containing:
            - symbol: Trading symbol
            - timeframe: Timeframe (e.g., "1H", "4H")
            - candles: List of OHLCV data
            - signal: Entry signal info (direction, entry, sl, tp, confidence)
            - supply_zones: List of {top, bottom, strength, label} dicts
            - demand_zones: List of {top, bottom, strength, label} dicts
            - confirmations: List of confirmation reasons
            - entry_type: Type of entry (choch, continuation, ds_sd_flip)
            - trend: Market trend direction
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
        confirmations = input_data.get('confirmations', [])
        entry_type = input_data.get('entry_type', '')
        trend = input_data.get('trend', '')
        output_path = input_data.get('output_path', '/tmp/chart.png')
        
        if not candles:
            return {"success": False, "error": "No candle data provided"}
        
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
        
        for col in ['Open', 'High', 'Low', 'Close']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        
        df = df.dropna(subset=['Open', 'High', 'Low', 'Close'])
        
        if len(df) < 5:
            return {"success": False, "error": "Not enough candle data"}
        
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
                'font.size': 9,
            }
        )
        
        fig, axes = mpf.plot(
            df,
            type='candle',
            style=style,
            volume=False,
            returnfig=True,
            figsize=(16, 10),
            warn_too_much_data=False,
            tight_layout=False,
        )
        
        ax = axes[0]
        
        y_min, y_max = ax.get_ylim()
        x_min, x_max = ax.get_xlim()
        
        for zone in supply_zones:
            top = float(zone.get('top', 0))
            bottom = float(zone.get('bottom', 0))
            strength = zone.get('strength', 'moderate')
            label = zone.get('label', 'Supply')
            
            if top > 0 and bottom > 0:
                alpha = 0.35 if strength == 'strong' else 0.25
                linewidth = 2 if strength == 'strong' else 1
                
                rect = mpatches.Rectangle(
                    (x_min, bottom),
                    x_max - x_min,
                    top - bottom,
                    linewidth=linewidth,
                    edgecolor='#ef4444',
                    facecolor=f'#ef4444{hex(int(alpha * 255))[2:].zfill(2)}',
                    linestyle='--' if strength != 'strong' else '-',
                    zorder=1
                )
                ax.add_patch(rect)
                
                zone_mid = (top + bottom) / 2
                if y_min <= zone_mid <= y_max:
                    ax.annotate(
                        f'{label}',
                        xy=(x_min + 0.5, zone_mid),
                        fontsize=8,
                        color='#ef4444',
                        fontweight='bold' if strength == 'strong' else 'normal',
                        va='center',
                        ha='left',
                        zorder=10
                    )
        
        for zone in demand_zones:
            top = float(zone.get('top', 0))
            bottom = float(zone.get('bottom', 0))
            strength = zone.get('strength', 'moderate')
            label = zone.get('label', 'Demand')
            
            if top > 0 and bottom > 0:
                alpha = 0.35 if strength == 'strong' else 0.25
                linewidth = 2 if strength == 'strong' else 1
                
                rect = mpatches.Rectangle(
                    (x_min, bottom),
                    x_max - x_min,
                    top - bottom,
                    linewidth=linewidth,
                    edgecolor='#22c55e',
                    facecolor=f'#22c55e{hex(int(alpha * 255))[2:].zfill(2)}',
                    linestyle='--' if strength != 'strong' else '-',
                    zorder=1
                )
                ax.add_patch(rect)
                
                zone_mid = (top + bottom) / 2
                if y_min <= zone_mid <= y_max:
                    ax.annotate(
                        f'{label}',
                        xy=(x_min + 0.5, zone_mid),
                        fontsize=8,
                        color='#22c55e',
                        fontweight='bold' if strength == 'strong' else 'normal',
                        va='center',
                        ha='left',
                        zorder=10
                    )
        
        if signal:
            direction = signal.get('direction', '')
            entry = float(signal.get('entry', 0))
            sl = float(signal.get('stopLoss', 0))
            tp = float(signal.get('takeProfit', 0))
            confidence = signal.get('confidence', 0)
            
            if entry > 0:
                color = '#22c55e' if direction == 'BUY' else '#ef4444'
                ax.axhline(y=entry, color=color, linestyle='-', linewidth=2.5, alpha=0.9, zorder=5)
                
                entry_label = f' ENTRY: {entry:.5f}'
                ax.annotate(
                    entry_label,
                    xy=(x_max, entry),
                    fontsize=11,
                    color=color,
                    fontweight='bold',
                    va='center',
                    ha='left',
                    zorder=10,
                    bbox=dict(boxstyle='round,pad=0.3', facecolor='#0a0a0f', edgecolor=color, alpha=0.9)
                )
            
            if sl > 0:
                ax.axhline(y=sl, color='#f59e0b', linestyle='--', linewidth=2, alpha=0.8, zorder=5)
                ax.annotate(
                    f' SL: {sl:.5f}',
                    xy=(x_max, sl),
                    fontsize=10,
                    color='#f59e0b',
                    fontweight='bold',
                    va='center',
                    ha='left',
                    zorder=10,
                    bbox=dict(boxstyle='round,pad=0.2', facecolor='#0a0a0f', edgecolor='#f59e0b', alpha=0.8)
                )
                
                if entry > 0:
                    sl_fill_color = '#f59e0b22'
                    if direction == 'BUY':
                        ax.fill_between([x_min, x_max], sl, entry, color=sl_fill_color, alpha=0.3, zorder=0)
                    else:
                        ax.fill_between([x_min, x_max], entry, sl, color=sl_fill_color, alpha=0.3, zorder=0)
            
            if tp > 0:
                ax.axhline(y=tp, color='#3b82f6', linestyle='--', linewidth=2, alpha=0.8, zorder=5)
                ax.annotate(
                    f' TP: {tp:.5f}',
                    xy=(x_max, tp),
                    fontsize=10,
                    color='#3b82f6',
                    fontweight='bold',
                    va='center',
                    ha='left',
                    zorder=10,
                    bbox=dict(boxstyle='round,pad=0.2', facecolor='#0a0a0f', edgecolor='#3b82f6', alpha=0.8)
                )
                
                if entry > 0:
                    tp_fill_color = '#3b82f622'
                    if direction == 'BUY':
                        ax.fill_between([x_min, x_max], entry, tp, color=tp_fill_color, alpha=0.3, zorder=0)
                    else:
                        ax.fill_between([x_min, x_max], tp, entry, color=tp_fill_color, alpha=0.3, zorder=0)
        
        timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
        direction_text = signal.get('direction', 'SIGNAL') if signal else 'ANALYSIS'
        confidence_text = f" ({signal.get('confidence', 0)}%)" if signal and signal.get('confidence') else ''
        
        title_color = '#22c55e' if direction_text == 'BUY' else '#ef4444' if direction_text == 'SELL' else '#e5e7eb'
        
        main_title = f'{symbol} - {timeframe} | {direction_text}{confidence_text}'
        ax.set_title(main_title, fontsize=16, fontweight='bold', color=title_color, pad=15, loc='left')
        
        ax.text(
            0.99, 1.02,
            timestamp,
            transform=ax.transAxes,
            fontsize=9,
            color='#9ca3af',
            ha='right',
            va='bottom'
        )
        
        info_text_parts = []
        
        if trend:
            trend_icon = 'Bullish' if trend.lower() == 'bullish' else 'Bearish' if trend.lower() == 'bearish' else 'Sideways'
            info_text_parts.append(f'Trend: {trend_icon}')
        
        if entry_type:
            entry_type_display = {
                'choch': 'CHoCH (Change of Character)',
                'continuation': 'Trend Continuation',
                'ds_sd_flip': 'Zone Flip (D/S to S/D)',
            }.get(entry_type, entry_type.upper())
            info_text_parts.append(f'Entry: {entry_type_display}')
        
        if info_text_parts:
            info_text = ' | '.join(info_text_parts)
            ax.text(
                0.01, -0.08,
                info_text,
                transform=ax.transAxes,
                fontsize=10,
                color='#d1d5db',
                ha='left',
                va='top',
                fontweight='bold'
            )
        
        if confirmations and len(confirmations) > 0:
            conf_text = 'Confirmations:\n' + '\n'.join([f'  - {c}' for c in confirmations[:5]])
            ax.text(
                0.01, -0.12,
                conf_text,
                transform=ax.transAxes,
                fontsize=9,
                color='#9ca3af',
                ha='left',
                va='top',
                linespacing=1.4
            )
        
        legend_elements = [
            mpatches.Patch(facecolor='#ef444440', edgecolor='#ef4444', label='Supply Zone'),
            mpatches.Patch(facecolor='#22c55e40', edgecolor='#22c55e', label='Demand Zone'),
            Line2D([0], [0], color='#f59e0b', linewidth=2, linestyle='--', label='Stop Loss'),
            Line2D([0], [0], color='#3b82f6', linewidth=2, linestyle='--', label='Take Profit'),
        ]
        
        ax.legend(
            handles=legend_elements,
            loc='upper right',
            fontsize=9,
            facecolor='#1f2937',
            edgecolor='#374151',
            labelcolor='#e5e7eb',
            framealpha=0.9
        )
        
        ax.text(
            0.99, -0.08,
            'www.FindBuyAndSellZones.com',
            transform=ax.transAxes,
            fontsize=9,
            color='#6b7280',
            ha='right',
            va='top',
            style='italic'
        )
        
        plt.subplots_adjust(bottom=0.25, top=0.92, left=0.08, right=0.85)
        
        os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
        
        fig.savefig(output_path, dpi=150, bbox_inches='tight', facecolor='#0a0a0f', edgecolor='none')
        plt.close(fig)
        
        return {"success": True, "path": output_path}
        
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "traceback": traceback.format_exc()}


def main():
    """Main entry point - reads JSON from stdin, outputs JSON to stdout"""
    try:
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
