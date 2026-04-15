import { db } from './db';
import { sql } from 'drizzle-orm';

export async function initializeDatabase() {
  try {
    console.log('[Database] Initializing schema...');
    
    // Create all required tables with proper definitions
    const createTableStatements = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      )`,
      
      // Trades table
      `CREATE TABLE IF NOT EXISTS trades (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR REFERENCES users(id),
        symbol TEXT NOT NULL,
        type TEXT NOT NULL,
        strategy TEXT NOT NULL,
        entry_price DECIMAL(12, 5) NOT NULL,
        exit_price DECIMAL(12, 5) NOT NULL,
        stop_loss DECIMAL(12, 5),
        take_profit DECIMAL(12, 5),
        quantity DECIMAL(10, 5) NOT NULL,
        pnl DECIMAL(10, 2) NOT NULL,
        pnl_percent DECIMAL(10, 2) NOT NULL,
        risk_reward TEXT,
        outcome TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        entry_reason TEXT NOT NULL,
        lesson TEXT,
        signal_id VARCHAR,
        entry_date TIMESTAMP,
        exit_date TIMESTAMP NOT NULL,
        duration TEXT NOT NULL,
        asset_class TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Trading Sessions table (CRITICAL)
      `CREATE TABLE IF NOT EXISTS trading_sessions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR REFERENCES users(id),
        session_name TEXT NOT NULL,
        starting_balance DECIMAL(12, 2) NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Journal Entries table
      `CREATE TABLE IF NOT EXISTS journal_entries (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR REFERENCES users(id),
        session_id VARCHAR REFERENCES trading_sessions(id),
        instrument TEXT,
        pair_category TEXT,
        direction TEXT,
        order_type TEXT,
        entry_price DECIMAL(12, 5),
        stop_loss DECIMAL(12, 5),
        take_profit DECIMAL(12, 5),
        stop_loss_distance DECIMAL(10, 2),
        take_profit_distance DECIMAL(10, 2),
        lot_size DECIMAL(10, 5),
        risk_reward DECIMAL(6, 2),
        risk_percent DECIMAL(5, 2),
        spread_at_entry DECIMAL(6, 2),
        entry_time TEXT,
        exit_time TEXT,
        day_of_week TEXT,
        trade_duration TEXT,
        entry_tf TEXT,
        analysis_tf TEXT,
        context_tf TEXT,
        outcome TEXT,
        profit_loss DECIMAL(10, 2),
        pips_gained_lost DECIMAL(10, 2),
        account_balance DECIMAL(12, 2),
        commission DECIMAL(8, 2),
        mae DECIMAL(10, 2),
        mfe DECIMAL(10, 2),
        planned_rr TEXT,
        achieved_rr TEXT,
        monetary_risk DECIMAL(10, 2),
        potential_reward DECIMAL(10, 2),
        primary_exit_reason TEXT,
        session_name TEXT,
        session_phase TEXT,
        entry_time_utc TEXT,
        timing_context TEXT,
        ai_extracted JSONB,
        manual_fields JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Economic Events table
      `CREATE TABLE IF NOT EXISTS economic_events (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        description TEXT,
        event_type TEXT NOT NULL,
        country TEXT NOT NULL,
        country_code TEXT,
        region TEXT NOT NULL,
        currency TEXT NOT NULL,
        impact_level TEXT NOT NULL,
        event_time TIMESTAMP WITH TIME ZONE NOT NULL,
        expected_value TEXT,
        previous_value TEXT,
        actual_value TEXT,
        unit TEXT,
        futures_implied_expectation TEXT,
        expert_sentiment TEXT,
        pre_release_sentiment TEXT,
        post_release_sentiment TEXT,
        surprise_factor TEXT,
        market_impact_analysis TEXT,
        currency_pair_impacts TEXT,
        stock_impacts TEXT,
        affected_currencies TEXT[],
        affected_stocks TEXT[],
        is_released BOOLEAN DEFAULT false,
        telegram_notified BOOLEAN DEFAULT false,
        source_site TEXT,
        source_url TEXT,
        last_scraped TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Telegram Subscribers table
      `CREATE TABLE IF NOT EXISTS telegram_subscribers (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        chat_id TEXT NOT NULL UNIQUE,
        phone_number TEXT,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Notifications table
      `CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        impact_level TEXT,
        metadata TEXT,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Trading Signals table
      `CREATE TABLE IF NOT EXISTS trading_signals (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        symbol TEXT NOT NULL,
        asset_class TEXT NOT NULL,
        type TEXT NOT NULL,
        strategy TEXT NOT NULL,
        entry_price DECIMAL(12, 5) NOT NULL,
        stop_loss DECIMAL(12, 5) NOT NULL,
        take_profit DECIMAL(12, 5) NOT NULL,
        risk_reward_ratio DECIMAL(5, 2) NOT NULL,
        primary_timeframe TEXT NOT NULL,
        confirmation_timeframe TEXT,
        execution_timeframe TEXT,
        overall_confidence INTEGER NOT NULL,
        interest_rate_diff_score DECIMAL(5, 2),
        interest_rate_diff_value DECIMAL(5, 2),
        interest_rate_notes TEXT,
        inflation_impact_score DECIMAL(5, 2),
        inflation_differential DECIMAL(5, 2),
        inflation_notes TEXT,
        trend_score DECIMAL(5, 2),
        trend_direction TEXT,
        trend_strength TEXT,
        trend_timeframes TEXT[],
        smc_score DECIMAL(5, 2),
        institutional_candle_detected BOOLEAN DEFAULT false,
        institutional_candle_data JSONB,
        order_block_type TEXT,
        order_block_level DECIMAL(12, 5),
        fvg_detected BOOLEAN DEFAULT false,
        fvg_level DECIMAL(12, 5),
        liquidity_sweep BOOLEAN DEFAULT false,
        liquidity_sweep_level DECIMAL(12, 5),
        breaker_block_detected BOOLEAN DEFAULT false,
        boc_choch_detected TEXT,
        smc_factors TEXT[],
        technical_reasons TEXT[],
        market_context TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        strength TEXT,
        zones_tested INTEGER DEFAULT 0,
        expires_at TIMESTAMP,
        executed_at TIMESTAMP,
        invalidated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Pending Setups table
      `CREATE TABLE IF NOT EXISTS pending_setups (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        symbol TEXT NOT NULL,
        asset_class TEXT NOT NULL,
        type TEXT NOT NULL,
        setup_stage TEXT NOT NULL,
        potential_strategy TEXT,
        current_price DECIMAL(12, 5) NOT NULL,
        primary_timeframe TEXT NOT NULL,
        confirmation_timeframe TEXT,
        interest_rate_bias TEXT,
        inflation_bias TEXT,
        trend_bias TEXT,
        choch_detected BOOLEAN DEFAULT false,
        choch_direction TEXT,
        liquidity_sweep_detected BOOLEAN DEFAULT false,
        supply_demand_zone_targeted BOOLEAN DEFAULT false,
        zone_level DECIMAL(12, 5),
        zone_mitigated BOOLEAN DEFAULT false,
        levels_broken INTEGER DEFAULT 0,
        confirmations_pending TEXT[],
        setup_notes TEXT[],
        market_context TEXT,
        last_checked_price DECIMAL(12, 5),
        last_checked_at TIMESTAMP DEFAULT NOW(),
        ready_for_signal BOOLEAN DEFAULT false,
        invalidated BOOLEAN DEFAULT false,
        invalidation_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      
      // Interest Rates table
      `CREATE TABLE IF NOT EXISTS interest_rates (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        country TEXT NOT NULL,
        currency TEXT NOT NULL UNIQUE,
        central_bank TEXT NOT NULL,
        central_bank_code TEXT NOT NULL,
        current_rate DECIMAL(6, 3) NOT NULL,
        previous_rate DECIMAL(6, 3),
        change_in_bps INTEGER DEFAULT 0,
        last_meeting TEXT,
        next_meeting TEXT,
        last_updated TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )`,

      // ── Copy Trading Tables ──────────────────────────────────────────────

      // MT5 / broker account credentials (encrypted at rest)
      `CREATE TABLE IF NOT EXISTS copy_accounts (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR REFERENCES users(id),
        nickname TEXT NOT NULL,
        platform TEXT NOT NULL,
        broker_server TEXT,
        login_id TEXT NOT NULL,
        password_enc TEXT NOT NULL,
        role TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        symbol_prefix TEXT,
        symbol_suffix TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,

      // Signal provider / master account profiles
      `CREATE TABLE IF NOT EXISTS copy_masters (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR REFERENCES users(id),
        account_id VARCHAR REFERENCES copy_accounts(id),
        source_type TEXT NOT NULL,
        strategy_name TEXT,
        description TEXT,
        trading_style TEXT,
        primary_market TEXT,
        is_public BOOLEAN DEFAULT true,
        require_approval BOOLEAN DEFAULT false,
        show_open_trades BOOLEAN DEFAULT true,
        is_active BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,

      // Telegram signal source configuration
      `CREATE TABLE IF NOT EXISTS telegram_signal_sources (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        master_id VARCHAR REFERENCES copy_masters(id),
        bot_token_enc TEXT,
        phone_number TEXT,
        api_id TEXT,
        api_hash_enc TEXT,
        channel_name TEXT,
        channel_type TEXT,
        multi_channel BOOLEAN DEFAULT false,
        filter_sender TEXT,
        entry_keyword TEXT,
        sl_keyword TEXT,
        tp_keyword TEXT,
        symbol_keyword TEXT,
        execute_no_sl BOOLEAN DEFAULT false,
        execute_no_tp BOOLEAN DEFAULT true,
        use_first_tp_only BOOLEAN DEFAULT true,
        auto_update BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT false,
        session_file TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,

      // Follower account copy settings per master subscription
      `CREATE TABLE IF NOT EXISTS copy_followers (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR REFERENCES users(id),
        account_id VARCHAR REFERENCES copy_accounts(id),
        master_id VARCHAR REFERENCES copy_masters(id),
        lot_mode TEXT NOT NULL DEFAULT 'mult',
        lot_multiplier DECIMAL(6, 2) DEFAULT 1.0,
        fixed_lot DECIMAL(8, 2),
        risk_percent DECIMAL(5, 2) DEFAULT 1.0,
        direction TEXT DEFAULT 'same',
        symbol_whitelist TEXT[],
        symbol_blacklist TEXT[],
        max_open_trades INTEGER DEFAULT 10,
        trade_delay_sec INTEGER DEFAULT 0,
        pause_inactive BOOLEAN DEFAULT true,
        pause_on_dd BOOLEAN DEFAULT true,
        session_filter BOOLEAN DEFAULT false,
        active_sessions TEXT[],
        max_dd_percent DECIMAL(5, 2),
        max_daily_loss DECIMAL(10, 2),
        notif_disconnect BOOLEAN DEFAULT true,
        notif_exec_fail BOOLEAN DEFAULT true,
        notif_dd_warn BOOLEAN DEFAULT true,
        notif_daily_warn BOOLEAN DEFAULT true,
        is_active BOOLEAN DEFAULT false,
        risk_accepted BOOLEAN DEFAULT false,
        deployed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,

      // Normalised master trade events (one row per signal)
      `CREATE TABLE IF NOT EXISTS copy_trades_master (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        master_id VARCHAR REFERENCES copy_masters(id),
        external_id TEXT NOT NULL,
        source TEXT NOT NULL,
        symbol TEXT NOT NULL,
        action TEXT NOT NULL,
        event_type TEXT NOT NULL,
        volume DECIMAL(10, 2),
        entry_price DECIMAL(12, 5),
        stop_loss DECIMAL(12, 5),
        take_profit DECIMAL(12, 5),
        closed_price DECIMAL(12, 5),
        raw_payload JSONB,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      )`,

      // Follower execution records mapped to each master trade
      `CREATE TABLE IF NOT EXISTS copy_trades_follower (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        master_trade_id VARCHAR REFERENCES copy_trades_master(id),
        follower_id VARCHAR REFERENCES copy_followers(id),
        external_id TEXT,
        symbol TEXT NOT NULL,
        action TEXT NOT NULL,
        event_type TEXT NOT NULL,
        volume DECIMAL(10, 2),
        entry_price DECIMAL(12, 5),
        stop_loss DECIMAL(12, 5),
        take_profit DECIMAL(12, 5),
        closed_price DECIMAL(12, 5),
        status TEXT DEFAULT 'pending',
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        executed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )`,

      // Full audit log for every copy trading action
      `CREATE TABLE IF NOT EXISTS copy_execution_logs (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        follower_id VARCHAR REFERENCES copy_followers(id),
        trade_id VARCHAR,
        level TEXT NOT NULL,
        event TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
    ];
    
    for (const statement of createTableStatements) {
      try {
        await db.execute(sql.raw(statement));
      } catch (err) {
        const error = err as any;
        if (!error?.message?.includes('already exists') && !error?.message?.includes('duplicate')) {
          console.error(`[Database] Table creation FAILED: ${error?.message}`);
          console.error(`[Database] Statement: ${statement.slice(0, 120)}...`);
        }
      }
    }

    // ── Indexes & constraints added after table creation ─────────────────────
    const indexStatements = [
      // Deduplication constraint: prevents the same master signal from being
      // inserted twice (ON CONFLICT DO NOTHING in insert_master_trade relies on this)
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_copy_trades_master_dedup
         ON copy_trades_master (master_id, external_id)`,
    ];

    for (const stmt of indexStatements) {
      try {
        await db.execute(sql.raw(stmt));
      } catch (err) {
        const error = err as any;
        if (!error?.message?.includes('already exists') && !error?.message?.includes('duplicate')) {
          console.error(`[Database] Index creation FAILED: ${error?.message}`);
        }
      }
    }

    console.log('[Database] Schema initialization complete - all tables created');
    return true;
  } catch (error) {
    console.error('[Database] Fatal initialization error:', (error as any)?.message);
    console.error('[Database] Full error:', error);
    return false;
  }
}
