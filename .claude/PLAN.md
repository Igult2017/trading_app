# Remove the duplicate calendar search hint

He circled the "SEARCH: TYPE MMM YYYY OR MM/YYYY AND PRESS ENTER" line at the bottom of the
calendar and asked for it removed.

It is a standalone desktop-only block (TradingCalendar.tsx:639-643). The search it describes is
a real input (NavSearch, rendered at :531 and :559) whose own placeholder already says
"e.g. Mar 2025" - so the line is a duplicate and deleting it costs no function.

Task: delete the block. Measured: the hint is gone, the search box still renders and still works.
