# Infod Trading Partner System - Design Guidelines

## Design Approach
**Selected Approach**: Design System (Material Design) with Financial Trading Industry References
**Justification**: This is a utility-focused, information-dense financial application requiring maximum efficiency and data clarity. Drawing inspiration from Bloomberg Terminal, TradingView, and MetaTrader interfaces.

**Key Design Principles**:
- Data-first hierarchy with clear visual separation
- High contrast for critical trading information
- Minimal cognitive load through consistent patterns
- Professional, trustworthy aesthetic

## Core Design Elements

### A. Color Palette
**Dark Mode Primary** (default):
- Background: 210 15% 8%
- Surface: 210 12% 12% 
- Primary: 210 100% 60% (trading blue)
- Success: 120 60% 50% (profit green)
- Danger: 0 75% 60% (loss red)
- Warning: 45 90% 60% (alert amber)
- Text Primary: 210 15% 95%
- Text Secondary: 210 10% 70%

**Light Mode**:
- Background: 210 15% 98%
- Surface: 210 10% 95%
- Text Primary: 210 15% 15%

### B. Typography
**Font Stack**: Inter (Google Fonts) for optimal number readability
- Headers: 600 weight, 24px-32px
- Body: 400 weight, 14px-16px  
- Data/Numbers: 500 weight, 14px (tabular numbers)
- Labels: 500 weight, 12px uppercase

### C. Layout System
**Spacing Units**: Consistent use of 4, 8, 16, 24 units
- Component padding: p-4, p-6
- Section margins: m-8, m-12
- Grid gaps: gap-4, gap-6

### D. Component Library

**Dashboard Layout**:
- 12-column grid system with breakpoints
- Sidebar navigation (240px fixed width)
- Main content area with card-based modules
- Status bar showing active session and connection

**Data Display Components**:
- Market overview cards with price, change, volume
- Economic calendar table with impact indicators
- Signal cards showing entry/exit levels and R:R ratios
- Chart containers with technical indicator overlays

**Navigation**:
- Vertical sidebar with market categories
- Horizontal tabs for timeframe switching
- Breadcrumb navigation for deep analysis views

**Interactive Elements**:
- Real-time price tickers with color-coded changes
- Expandable signal details with reasoning
- Filterable watchlists and screeners

### E. Specialized Financial UI Patterns

**Price Display Standards**:
- Green/red color coding for positive/negative changes
- Consistent decimal precision per asset class
- Percentage changes in parentheses
- Volume with K/M/B abbreviations

**Chart Integration**:
- Dark theme candlestick charts
- Support/resistance level overlays
- Signal annotation markers
- Multi-timeframe toggle buttons

**Alert System**:
- Toast notifications for new signals
- Status indicators for market sessions
- Connection status with WebSocket health
- Priority-based notification styling

**Data Tables**:
- Sortable columns with directional indicators
- Row highlighting for active positions
- Expandable rows for additional details
- Fixed headers for long datasets

## Visual Hierarchy
1. **Critical Trading Data**: Largest, highest contrast
2. **Market Context**: Secondary prominence with clear grouping
3. **Historical/Reference**: Subtle styling, easily scannable
4. **System Status**: Minimal but always visible

This design system prioritizes speed of information processing and decision-making while maintaining the professional standards expected in financial trading applications.