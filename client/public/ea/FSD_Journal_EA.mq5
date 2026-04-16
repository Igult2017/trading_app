//+------------------------------------------------------------------+
//|                                          FSD_Journal_EA.mq5      |
//|                         FSD Journal — Auto Trade Sync EA         |
//|                                                                  |
//|  Automatically posts every closed trade to your FSD Journal      |
//|  account so it is journaled without any manual entry.            |
//|                                                                  |
//|  Setup:                                                          |
//|   1. Copy this file to: MT5 > File > Open Data Folder            |
//|      > MQL5 > Experts                                            |
//|   2. Restart MT5 (or F5 in the Navigator)                        |
//|   3. Drag this EA onto any chart (any symbol / timeframe)        |
//|   4. Paste your Webhook URL into the InpWebhookURL input         |
//|   5. Go to Tools > Options > Expert Advisors                     |
//|      > Allow WebRequest for listed URL                           |
//|      Add your server domain, e.g. https://yourdomain.com         |
//|   6. Enable Auto Trading (F7 or the toolbar toggle)              |
//+------------------------------------------------------------------+
#property copyright "FSD Journal"
#property version   "1.10"
#property description "Syncs closed trades to FSD Journal automatically."
#property strict

//── Inputs ────────────────────────────────────────────────────────────────────
input string InpWebhookURL    = "";   // Webhook URL  ← paste from Accounts page
input int    InpTimerSeconds  = 15;   // Sync interval in seconds
input int    InpMagicFilter   = -1;   // Magic number to sync (-1 = all trades)
input int    InpHistoryDays   = 90;   // Days of history to check on first run
input bool   InpDebugMode     = false; // Print debug info to the Experts log

#define FSD_LOG(msg)  if(InpDebugMode) Print("[FSD] ", msg)

//── Globals ───────────────────────────────────────────────────────────────────
string g_sentFile = "";
string g_sentIds[];

//+------------------------------------------------------------------+
int OnInit()
{
  if(StringLen(InpWebhookURL) < 12)
  {
    Alert("FSD Journal EA: Webhook URL is empty.\n"
          "Paste your URL from the FSD Journal Accounts page into the EA inputs.");
    return(INIT_PARAMETERS_INCORRECT);
  }

  // Per-account tracking file so multi-account setups don't collide
  g_sentFile = "fsd_sent_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + ".csv";
  LoadSentIds();

  EventSetTimer(InpTimerSeconds);
  Print("[FSD Journal] EA started — account ", AccountInfoInteger(ACCOUNT_LOGIN),
        " | tracking file: ", g_sentFile);
  return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason) { EventKillTimer(); }

//── Trigger on timer and on any trade event ───────────────────────────────────
void OnTimer()  { SyncClosedTrades(); }
void OnTrade()  { SyncClosedTrades(); }

//+------------------------------------------------------------------+
//| Core sync: find unsent closed positions and POST them            |
//+------------------------------------------------------------------+
void SyncClosedTrades()
{
  datetime fromTime = TimeCurrent() - (datetime)((long)InpHistoryDays * 86400);
  if(!HistorySelect(fromTime, TimeCurrent())) return;

  int total = HistoryDealsTotal();

  // First pass — collect all unsent OUT deal tickets + position IDs
  ulong outDeals[];
  long  outPosIds[];

  for(int i = 0; i < total; i++)
  {
    ulong deal = HistoryDealGetTicket(i);
    if(deal == 0) continue;

    long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
    if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT) continue;

    if(InpMagicFilter != -1 &&
       HistoryDealGetInteger(deal, DEAL_MAGIC) != (long)InpMagicFilter)
      continue;

    long posId = HistoryDealGetInteger(deal, DEAL_POSITION_ID);
    if(IsSent(IntegerToString(posId))) continue;

    int sz = ArraySize(outDeals);
    ArrayResize(outDeals,  sz + 1);
    ArrayResize(outPosIds, sz + 1);
    outDeals[sz]  = deal;
    outPosIds[sz] = posId;
  }

  if(ArraySize(outDeals) == 0) return;

  // Second pass — build JSON and POST each one
  for(int i = 0; i < ArraySize(outDeals); i++)
  {
    string json = BuildTradeJson(outDeals[i], outPosIds[i]);
    if(StringLen(json) == 0) continue;

    if(PostJson("[" + json + "]"))
    {
      MarkSent(IntegerToString(outPosIds[i]));
      FSD_LOG("Synced position " + IntegerToString(outPosIds[i]));
    }
  }
}

//+------------------------------------------------------------------+
//| Build a single-trade JSON object from deal + position history    |
//+------------------------------------------------------------------+
string BuildTradeJson(ulong closeDeal, long posId)
{
  string   symbol     = HistoryDealGetString (closeDeal, DEAL_SYMBOL);
  double   lots       = HistoryDealGetDouble (closeDeal, DEAL_VOLUME);
  double   closePrice = HistoryDealGetDouble (closeDeal, DEAL_PRICE);
  double   profit     = HistoryDealGetDouble (closeDeal, DEAL_PROFIT);
  double   commission = HistoryDealGetDouble (closeDeal, DEAL_COMMISSION);
  double   swap       = HistoryDealGetDouble (closeDeal, DEAL_SWAP);
  datetime closeTime  = (datetime)HistoryDealGetInteger(closeDeal, DEAL_TIME);
  long     dealType   = HistoryDealGetInteger(closeDeal, DEAL_TYPE);
  long     magic      = HistoryDealGetInteger(closeDeal, DEAL_MAGIC);
  string   comment    = HistoryDealGetString (closeDeal, DEAL_COMMENT);

  // OUT deal types: SELL closes a Long, BUY closes a Short
  string direction = (dealType == DEAL_TYPE_SELL) ? "Long" : "Short";

  // Retrieve open price / time / SL / TP from the position's IN deal + orders
  double   openPrice = 0;
  datetime openTime  = 0;
  double   sl = 0, tp = 0;

  if(HistorySelectByPosition(posId))
  {
    // Find the IN deal
    int dealCount = HistoryDealsTotal();
    for(int j = 0; j < dealCount; j++)
    {
      ulong t = HistoryDealGetTicket(j);
      if(HistoryDealGetInteger(t, DEAL_ENTRY) == DEAL_ENTRY_IN)
      {
        openPrice = HistoryDealGetDouble (t, DEAL_PRICE);
        openTime  = (datetime)HistoryDealGetInteger(t, DEAL_TIME);
        break;
      }
    }

    // Find the opening order to get SL / TP
    int orderCount = HistoryOrdersTotal();
    for(int j = 0; j < orderCount; j++)
    {
      ulong o = HistoryOrderGetTicket(j);
      long  ot = HistoryOrderGetInteger(o, ORDER_TYPE);
      if(ot == ORDER_TYPE_BUY || ot == ORDER_TYPE_SELL)
      {
        sl = HistoryOrderGetDouble(o, ORDER_SL);
        tp = HistoryOrderGetDouble(o, ORDER_TP);
        break;
      }
    }
  }

  if(openPrice == 0 || openTime == 0)
  {
    FSD_LOG("Skipping position " + IntegerToString(posId) + " — no IN deal found");
    return("");
  }

  int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
  if(digits == 0) digits = 5;

  string j = "{";
  j += "\"externalId\":\""  + IntegerToString(posId)               + "\",";
  j += "\"symbol\":\""      + symbol                               + "\",";
  j += "\"direction\":\""   + direction                            + "\",";
  j += "\"lots\":"          + DoubleToString(lots, 2)              + ",";
  j += "\"openPrice\":"     + DoubleToString(openPrice, digits)    + ",";
  j += "\"closePrice\":"    + DoubleToString(closePrice, digits)   + ",";
  j += "\"openTime\":"      + IntegerToString((long)openTime)      + ",";
  j += "\"closeTime\":"     + IntegerToString((long)closeTime)     + ",";
  j += "\"profit\":"        + DoubleToString(profit, 2)            + ",";
  j += "\"commission\":"    + DoubleToString(commission, 2)        + ",";
  j += "\"swap\":"          + DoubleToString(swap, 2)              + ",";
  j += "\"magic\":"         + IntegerToString(magic)               + ",";
  j += "\"comment\":\""     + EscapeJson(comment)                  + "\"";
  if(sl > 0) j += ",\"stopLoss\":"   + DoubleToString(sl, digits);
  if(tp > 0) j += ",\"takeProfit\":" + DoubleToString(tp, digits);
  j += "}";

  return(j);
}

//+------------------------------------------------------------------+
//| HTTP POST helper                                                 |
//+------------------------------------------------------------------+
bool PostJson(string body)
{
  char   req[], res[];
  string resHeaders;
  string headers = "Content-Type: application/json\r\n";

  int len = StringLen(body);
  StringToCharArray(body, req, 0, len);
  ArrayResize(req, len); // drop null terminator

  int code = WebRequest("POST", InpWebhookURL, headers, 5000, req, res, resHeaders);

  if(code == 200 || code == 201) return(true);

  if(code == -1)
    Print("[FSD Journal] WebRequest blocked. Add your server URL to:\n"
          "  Tools > Options > Expert Advisors > Allow WebRequest for listed URL");
  else
    Print("[FSD Journal] POST failed — HTTP ", code);

  return(false);
}

//+------------------------------------------------------------------+
//| Escape special characters for JSON strings                       |
//+------------------------------------------------------------------+
string EscapeJson(string s)
{
  StringReplace(s, "\\", "\\\\");
  StringReplace(s, "\"", "\\\"");
  StringReplace(s, "\n", "\\n");
  StringReplace(s, "\r", "\\r");
  StringReplace(s, "\t", "\\t");
  return(s);
}

//+------------------------------------------------------------------+
//| Persistence — track which position IDs have been sent            |
//+------------------------------------------------------------------+
void LoadSentIds()
{
  int h = FileOpen(g_sentFile, FILE_READ | FILE_CSV | FILE_COMMON | FILE_ANSI);
  if(h == INVALID_HANDLE) return;

  while(!FileIsEnding(h))
  {
    string id = FileReadString(h);
    if(StringLen(id) > 0)
    {
      int sz = ArraySize(g_sentIds);
      ArrayResize(g_sentIds, sz + 1);
      g_sentIds[sz] = id;
    }
  }
  FileClose(h);
  FSD_LOG("Loaded " + IntegerToString(ArraySize(g_sentIds)) + " previously synced IDs");
}

bool IsSent(string id)
{
  for(int i = 0; i < ArraySize(g_sentIds); i++)
    if(g_sentIds[i] == id) return(true);
  return(false);
}

void MarkSent(string id)
{
  int sz = ArraySize(g_sentIds);
  ArrayResize(g_sentIds, sz + 1);
  g_sentIds[sz] = id;

  // Rewrite the whole file (keeps it clean; typical history is <10k entries)
  int h = FileOpen(g_sentFile, FILE_WRITE | FILE_CSV | FILE_COMMON | FILE_ANSI);
  if(h == INVALID_HANDLE) return;
  for(int i = 0; i < ArraySize(g_sentIds); i++)
    FileWrite(h, g_sentIds[i]);
  FileClose(h);
}
