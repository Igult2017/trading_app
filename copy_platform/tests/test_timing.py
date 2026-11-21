"""THE DELAY OF EVERY COPY, by the broker's own clock (plan step 9, 21 Nov 2026).

Real `timing.broker_ms` on real execution events, and real `jobs.stamp` on an in-memory database:
  * the time is the deal's execution time when there is a deal, else the order's / position's last update;
  * the delay stored is the follower's broker time minus the master's.
"""
from types import SimpleNamespace

from _harness import Suite
from sqlalchemy import ARRAY, create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import db as DB
import jobs
from timing import broker_ms
from ctrader_open_api.messages.OpenApiMessages_pb2 import ProtoOAExecutionEvent

s = Suite("COPY — every copy's delay, measured by the broker's clock")


@compiles(ARRAY, "sqlite")
def _t(t, c, **kw):
    return "TEXT"


e = ProtoOAExecutionEvent(ctidTraderAccountId=1, executionType=3)
e.order.orderId, e.order.utcLastUpdateTimestamp = 5, 1_795_000_000_100
s.check("an order event: the order's last update", broker_ms(e), 1_795_000_000_100)
e.deal.dealId, e.deal.executionTimestamp = 9, 1_795_000_000_250
s.check("a fill: the deal's execution time comes first", broker_ms(e), 1_795_000_000_250)
s.check("an event with no time: None (never a guess)", broker_ms(ProtoOAExecutionEvent(ctidTraderAccountId=1,
                                                                                         executionType=2)), None)

eng = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
DB.CopyJob.__table__.create(eng)
DB.CopyFollower.__table__.create(eng)
S = sessionmaker(bind=eng)
# a plain row is enough for the stamp
with S() as db:
    db.add(DB.CopyJob(id="j1", follower_id="f1", event_type="OPEN", status="started"))
    db.commit()
jobs.stamp("j1", 1_795_000_000_000, 1_795_000_000_180, session_factory=S)
with S() as db:
    j = db.get(DB.CopyJob, "j1")
    got = (j.master_ms, j.follower_ms, j.delay_ms)
s.check("the delay stored is follower minus master, in milliseconds", got, (1_795_000_000_000, 1_795_000_000_180, 180))
jobs.stamp("j1", None, 1_795_000_000_300, session_factory=S)
with S() as db:
    s.check("no master time -> no delay invented", db.get(DB.CopyJob, "j1").delay_ms, None)
s.done()
