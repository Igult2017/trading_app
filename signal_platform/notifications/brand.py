"""The app's name, for anything the SIGNAL PLATFORM sends out.

⚠ WHY THIS FILE EXISTS. The app was renamed from Trade&Journal to DailyTradeBook on 2026-10-11 and
the Python senders were missed entirely — on 25 Oct every signal, every system message and the risk
disclaimer on every tap alert still went out under the old name, in his channel and his DM. Five
separate hand-written copies, one per message template, so renaming meant finding all five.

Node had already solved exactly this (`server/lib/brand.ts`), and for exactly the same reason: its
own rename turned up the name written out by hand in two places, one of which was missed by the
file list and only caught by a full-text sweep. Defining it once is what stops a sixth message
drifting away quietly.

⚠ THE NAME IS PLAIN TEXT HERE, and escaping happens at the point of use. These messages are sent
with Telegram's HTML parse mode, where a raw `&` is a parse error — which is why the old name
appeared in the code pre-escaped as "Trade&amp;Journal". `DailyTradeBook` contains nothing HTML
cares about, but `html_safe()` exists so a future name is not a silent outage.

⚠ THERE ARE TWO OTHER COPIES, AND THEY ARE NOT DUPLICATES TO TIDY AWAY. The Node server has its own
(`server/lib/brand.ts`) and the browser has its own (`client/src/hooks/usePageTitle.ts`,
`client/src/components/Brand.tsx`). The three are bundled separately and cannot import across those
lines. Renaming the app means changing it in all three.
"""

#: The name as a person reads it.
BRAND_NAME = "DailyTradeBook"


def html_safe(text: str = BRAND_NAME) -> str:
    """The name with the characters Telegram's HTML mode would choke on escaped.

    Telegram rejects the whole message on a bad entity, so an unescaped `&` in the name does not
    corrupt one word — it silently loses the entire signal. That is what the old pre-escaped
    "Trade&amp;Journal" was guarding against, written by hand in five places.
    """
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


#: The footer every signal and system message carries.
SIGNATURE_HTML = f"⚡️ <i>{html_safe()} Signal Platform</i>"

#: The standing risk line on outgoing alerts. NOT decoration, and never trimmed to shorten a
#: message: on a channel that publishes trade signals it is the part that matters most.
RISK_DISCLAIMER_HTML = (
    f"<i>⚠️ {html_safe()} does not offer financial advice and is not liable for any "
    f"losses you incur.</i>"
)
