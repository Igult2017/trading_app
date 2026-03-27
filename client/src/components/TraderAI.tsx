import React, { useState, useRef, useEffect } from "react";
import {
  Send, RotateCcw, Copy, Check, Download,
  FileText, ChevronRight, AlertCircle, User
} from "lucide-react";

const AtomAI = ({ size = 20, color = "white" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="20" cy="20" rx="18" ry="7" stroke={color} strokeWidth="2" fill="none"/>
    <ellipse cx="20" cy="20" rx="18" ry="7" stroke={color} strokeWidth="2" fill="none" transform="rotate(60 20 20)"/>
    <ellipse cx="20" cy="20" rx="18" ry="7" stroke={color} strokeWidth="2" fill="none" transform="rotate(120 20 20)"/>
    <text x="20" y="24.5" textAnchor="middle" fontSize="9" fontWeight="700" fontFamily="Montserrat, sans-serif" fill={color} letterSpacing="0.5">AI</text>
  </svg>
);

const SUGGESTIONS = [
  "What patterns do you see in my losing trades?",
  "Am I over-trading on any particular day?",
  "How does my emotional state affect my win rate?",
  "Which setup tags perform best for me?",
  "Am I following my risk management rules?",
  "What's my average R:R on winning vs losing trades?",
  "Do I trade better in specific sessions?",
  "Which instruments give me the best results?",
];

const F = "'Montserrat', sans-serif";

interface Message { role: "user" | "model"; content: string; }

export default function TraderAI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  const callAI = async (msgs: Message[]) => {
    const res = await fetch("/api/trader-ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: msgs }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return data.reply as string;
  };

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    if (taRef.current) taRef.current.style.height = "28px";
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const reply = await callAI(next);
      setMessages([...next, { role: "model", content: reply }]);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyMsg = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  };

  const exportChat = () => {
    if (!messages.length) return;
    const content = messages
      .map(m => `${m.role === "user" ? "You" : "Trader AI"}:\n${m.content}`)
      .join("\n\n---\n\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([content], { type: "text/plain" })),
      download: `trader-ai-${Date.now()}.txt`,
    });
    a.click();
  };

  const renderContent = (content: string) => {
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { elements.push(<div key={i} style={{ height: 8 }} />); i++; continue; }
      if (line.startsWith("### ")) {
        elements.push(<p key={i} style={{ fontFamily: F, fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginTop: 20, marginBottom: 8 }}>{line.slice(4)}</p>);
        i++; continue;
      }
      if (line.startsWith("## ")) {
        elements.push(<p key={i} style={{ fontFamily: F, fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.88)", marginTop: 16, marginBottom: 6 }}>{line.slice(3)}</p>);
        i++; continue;
      }
      if (line.startsWith("**") && line.endsWith("**")) {
        elements.push(<p key={i} style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.82)", marginBottom: 4 }}>{line.slice(2, -2)}</p>);
        i++; continue;
      }
      if (line.trim().startsWith("|")) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) { tableLines.push(lines[i]); i++; }
        elements.push(
          <div key={`t${i}`} style={{ overflowX: "auto", margin: "12px 0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: F }}>
              <tbody>
                {tableLines.map((row, ri) => {
                  if (row.replace(/[|\s\-]/g, "") === "") return null;
                  const cells = row.split("|").slice(1, -1);
                  const isHeader = ri === 0;
                  return (
                    <tr key={ri} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {cells.map((cell, ci) => (
                        <td key={ci} style={{ padding: "8px 12px", color: isHeader ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.7)", fontWeight: isHeader ? 500 : 400, fontSize: isHeader ? 11 : 13, textTransform: isHeader ? "uppercase" : "none", letterSpacing: isHeader ? "0.05em" : "0", whiteSpace: "nowrap", fontFamily: F }}>
                          {cell.trim()}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
      if (/^[-•*]\s/.test(line)) {
        elements.push(
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 5, alignItems: "flex-start" }}>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.2)", marginTop: 8, flexShrink: 0 }} />
            <span style={{ fontFamily: F, fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.65, fontWeight: 400 }}>{line.replace(/^[-•*]\s/, "")}</span>
          </div>
        );
        i++; continue;
      }
      elements.push(<p key={i} style={{ fontFamily: F, fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.72, marginBottom: 4, fontWeight: 400 }}>{line}</p>);
      i++;
    }
    return elements;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 130px)", background: "#070d15", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)", fontFamily: F }}>

      <style>{`
        @keyframes traderai-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes traderai-spin   { to{transform:rotate(360deg)} }
        .traderai-scroll::-webkit-scrollbar{width:4px}
        .traderai-scroll::-webkit-scrollbar-track{background:transparent}
        .traderai-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:10px}
        .traderai-ta::placeholder{color:rgba(255,255,255,0.2);font-family:'Montserrat',sans-serif;}
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: 52, background: "rgba(7,13,21,0.97)", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AtomAI size={14} color="white" />
          </div>
          <span style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", letterSpacing: "-0.02em" }}>Trader AI</span>
          <span style={{ fontFamily: F, fontSize: 11, color: "rgba(255,255,255,0.22)", fontWeight: 400 }}>Your Personal Trading Coach</span>
        </div>
        {messages.length > 0 && (
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { label: "Export", icon: <FileText size={12} />, action: exportChat },
              { label: "Clear",  icon: <RotateCcw size={12} />, action: () => { setMessages([]); setError(null); } },
            ].map(({ label, icon, action }) => (
              <button key={label} onClick={action}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: F, transition: "all 0.15s" }}
                onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(255,255,255,0.09)"; b.style.color = "rgba(255,255,255,0.7)"; }}
                onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(255,255,255,0.05)"; b.style.color = "rgba(255,255,255,0.45)"; }}
              >
                {icon}<span>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scrollable messages / empty state */}
      <div className="traderai-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {messages.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100%", padding: "32px 20px", textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, boxShadow: "0 0 48px rgba(99,102,241,0.25)" }}>
              <AtomAI size={22} color="white" />
            </div>
            <h2 style={{ fontFamily: F, fontSize: 21, fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.04em", marginBottom: 8, lineHeight: 1.2 }}>
              How can I analyse<br />your trades today?
            </h2>
            <p style={{ fontFamily: F, fontSize: 13, color: "rgba(255,255,255,0.3)", lineHeight: 1.65, maxWidth: 340, marginBottom: 28, fontWeight: 400 }}>
              Connected to your TradeLog database. Ask me anything about your performance, patterns, and edge.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%", maxWidth: 600 }}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => send(s)}
                  style={{ padding: "13px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, color: "rgba(255,255,255,0.55)", fontSize: 12, fontFamily: F, fontWeight: 400, cursor: "pointer", textAlign: "left", lineHeight: 1.5, transition: "all 0.18s", display: "flex", flexDirection: "column", gap: 8 }}
                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(99,102,241,0.08)"; b.style.borderColor = "rgba(99,102,241,0.35)"; b.style.color = "rgba(255,255,255,0.85)"; }}
                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(255,255,255,0.03)"; b.style.borderColor = "rgba(255,255,255,0.08)"; b.style.color = "rgba(255,255,255,0.55)"; }}
                >
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <ChevronRight size={11} color="#818cf8" />
                  </div>
                  <span style={{ fontFamily: F }}>{s}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: "24px 20px 8px" }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{ marginBottom: 28, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: msg.role === "user" ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg, #6366f1, #8b5cf6)", border: msg.role === "user" ? "1px solid rgba(255,255,255,0.09)" : "none", marginTop: 2 }}>
                  {msg.role === "user" ? <User size={12} color="rgba(255,255,255,0.45)" /> : <AtomAI size={12} color="white" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: F, fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.28)", marginBottom: 6 }}>
                    {msg.role === "user" ? "You" : "Trader AI"}
                  </div>
                  {msg.role === "user"
                    ? <p style={{ fontFamily: F, fontSize: 14, color: "rgba(255,255,255,0.88)", lineHeight: 1.65, fontWeight: 400 }}>{msg.content}</p>
                    : (
                      <div>
                        {renderContent(msg.content)}
                        <div style={{ display: "flex", gap: 4, marginTop: 8 }}
                          onMouseEnter={e => Array.from(e.currentTarget.children).forEach(c => (c as HTMLElement).style.opacity = "1")}
                          onMouseLeave={e => Array.from(e.currentTarget.children).forEach(c => (c as HTMLElement).style.opacity = "0")}
                        >
                          {[
                            { icon: copied === idx ? <Check size={12} /> : <Copy size={12} />, action: () => copyMsg(msg.content, idx) },
                            { icon: <Download size={12} />, action: () => { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([msg.content], { type: "text/plain" })), download: `analysis-${Date.now()}.txt` }); a.click(); } },
                          ].map(({ icon, action }, bi) => (
                            <button key={bi} onClick={action}
                              style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "rgba(255,255,255,0.35)", opacity: 0, transition: "all 0.15s" }}
                              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(255,255,255,0.07)"; b.style.color = "rgba(255,255,255,0.65)"; }}
                              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "transparent"; b.style.color = "rgba(255,255,255,0.35)"; }}
                            >{icon}</button>
                          ))}
                        </div>
                      </div>
                    )
                  }
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ marginBottom: 28, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                  <AtomAI size={12} color="white" />
                </div>
                <div style={{ flex: 1, paddingTop: 6 }}>
                  <div style={{ fontFamily: F, fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.28)", marginBottom: 10 }}>Trader AI</div>
                  <div style={{ display: "flex", gap: 5 }}>
                    {[0, 1, 2].map(d => (
                      <div key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.22)", animation: `traderai-bounce 1.2s ${d * 0.18}s ease-in-out infinite` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} style={{ height: 1 }} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div style={{ flexShrink: 0, padding: "12px 16px 14px", background: "rgba(7,13,21,0.97)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 8, marginBottom: 8 }}>
            <AlertCircle size={12} color="#f87171" />
            <span style={{ fontFamily: F, fontSize: 12, color: "#f87171" }}>{error}</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "flex-end", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 12, padding: "8px 8px 8px 14px", transition: "border-color 0.15s, box-shadow 0.15s" }}
          onFocusCapture={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = "rgba(99,102,241,0.45)"; d.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.1)"; }}
          onBlurCapture={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = "rgba(255,255,255,0.09)"; d.style.boxShadow = "none"; }}
        >
          <textarea
            ref={taRef}
            value={input}
            onChange={e => { setInput(e.target.value); autoResize(e.target); }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            disabled={loading}
            rows={1}
            placeholder="Message Trader AI..."
            className="traderai-ta"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", resize: "none", fontFamily: F, fontSize: 14, fontWeight: 400, color: "rgba(255,255,255,0.88)", lineHeight: 1.55, minHeight: 28, maxHeight: 160, padding: 0 }}
          />
          <button onClick={() => send()} disabled={!input.trim() || loading}
            style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: input.trim() && !loading ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", cursor: input.trim() && !loading ? "pointer" : "default", transition: "all 0.15s", flexShrink: 0, boxShadow: input.trim() && !loading ? "0 2px 14px rgba(99,102,241,0.35)" : "none" }}
          >
            {loading
              ? <div style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "white", borderRadius: "50%", animation: "traderai-spin 0.7s linear infinite" }} />
              : <Send size={13} color={input.trim() ? "white" : "rgba(255,255,255,0.18)"} />
            }
          </button>
        </div>
        <p style={{ fontFamily: F, textAlign: "center", fontSize: 10, fontWeight: 400, color: "rgba(255,255,255,0.15)", marginTop: 6 }}>
          Trader AI can make mistakes. Verify important insights independently.
        </p>
      </div>
    </div>
  );
}
