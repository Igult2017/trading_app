import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, RotateCcw, Copy, Check, Download,
  FileText, ChevronRight, AlertCircle, User,
  Plus, Trash2, MessageSquare, Pencil,
  PanelLeftClose, PanelLeftOpen
} from "lucide-react";
import { authFetch } from "@/lib/queryClient";


const AtomAI = ({ size = 20, color = "white" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="20" cy="20" rx="18" ry="7" stroke={color} strokeWidth="2" fill="none"/>
    <ellipse cx="20" cy="20" rx="18" ry="7" stroke={color} strokeWidth="2" fill="none" transform="rotate(60 20 20)"/>
    <ellipse cx="20" cy="20" rx="18" ry="7" stroke={color} strokeWidth="2" fill="none" transform="rotate(120 20 20)"/>
    <text x="20" y="24.5" textAnchor="middle" fontSize="9" fontWeight="700" fontFamily="Montserrat, sans-serif" fill={color} letterSpacing="0.5">AI</text>
  </svg>
);

const SUGGESTIONS = [
  "Build me a strategy based on my best-performing conditions",
  "Analyze my drawdown and tell me how to avoid it",
  "Which instrument and session gives me the best edge?",
  "What are my worst-performing setups and why?",
  "Break down my win rate and profit factor by timeframe",
  "Which months did I lose the most and what caused it?",
  "What is my expectancy and profit factor?",
  "Where am I losing money — instrument, session, or setup?",
];

const F  = "'Montserrat', sans-serif";    // UI chrome
const FK = "'Kalam', cursive";            // AI response body
const FM = "'JetBrains Mono', monospace"; // inline code chips

interface Message { role: "user" | "model"; content: string; }
interface ChatSummary {
  id: string;
  title: string;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function TraderAI({ sessionId }: { sessionId?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("traderai.sidebarCollapsed") === "1";
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem("traderai.sidebarCollapsed", sidebarCollapsed ? "1" : "0");
    } catch { /* ignore */ }
  }, [sidebarCollapsed]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // ── Chat list management ─────────────────────────────────────────────────────
  const refreshChats = useCallback(async () => {
    setChatsLoading(true);
    try {
      const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
      const res = await authFetch(`/api/trader-ai/chats${qs}`);
      if (res.ok) {
        const data = await res.json();
        setChats(data.chats || []);
      }
    } catch { /* ignore */ }
    finally { setChatsLoading(false); }
  }, [sessionId]);

  useEffect(() => { refreshChats(); }, [refreshChats]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Close model menu when clicking outside
  useEffect(() => {
    if (!modelMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const menu = document.getElementById("traderai-model-menu");
      if (menu && !menu.contains(target)) setModelMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelMenuOpen]);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  const newChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setError(null);
    setInput("");
    if (taRef.current) taRef.current.style.height = "28px";
  };

  const loadChat = async (id: string) => {
    if (id === activeChatId) return;
    setError(null);
    try {
      const res = await authFetch(`/api/trader-ai/chats/${id}`);
      if (!res.ok) throw new Error(`Failed to load chat (${res.status})`);
      const data = await res.json();
      setActiveChatId(id);
      setMessages(
        (data.messages || []).map((m: any) => ({
          role: m.role === "user" ? "user" : "model",
          content: m.content,
        })),
      );
    } catch (err: any) {
      setError(err?.message || "Could not load chat.");
    }
  };

  const deleteChat = async (id: string) => {
    try {
      const res = await authFetch(`/api/trader-ai/chats/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to delete (${res.status})`);
      setChats(prev => prev.filter(c => c.id !== id));
      if (id === activeChatId) newChat();
    } catch (err: any) {
      setError(err?.message || "Could not delete chat.");
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const submitRename = async (id: string) => {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title) return;
    try {
      const res = await authFetch(`/api/trader-ai/chats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(`Failed to rename (${res.status})`);
      setChats(prev => prev.map(c => c.id === id ? { ...c, title } : c));
    } catch (err: any) {
      setError(err?.message || "Could not rename chat.");
    }
  };

  const callAI = async (msgs: Message[]) => {
    const res = await authFetch("/api/trader-ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: msgs, sessionId, chatId: activeChatId }),
    });
    let data: any = null;
    try { data = await res.json(); } catch { /* non-JSON response */ }
    if (!res.ok) {
      // Server may still have created/persisted the chat row even on failure.
      if (data?.chatId) setActiveChatId(data.chatId);
      const serverMsg = (data && (data.error || data.message)) || "";
      throw new Error(serverMsg || `Request failed (${res.status})`);
    }
    if (data?.chatId) setActiveChatId(data.chatId);
    return (data?.reply as string) ?? "";
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
      // Refresh sidebar so the new/updated chat appears at the top
      refreshChats();
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
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

  // ── Inline markdown parser: **bold**, *italic*, `code` ─────────────────────
  const renderInline = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
    let last = 0, m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      if (m[0].startsWith("**"))
        parts.push(<strong key={m.index} style={{ fontWeight: 700, color: "#e8e9eb" }}>{m[2]}</strong>);
      else if (m[0].startsWith("*"))
        parts.push(<em key={m.index} style={{ fontStyle: "italic", color: "rgba(255,255,255,0.65)" }}>{m[3]}</em>);
      else
        parts.push(<code key={m.index} style={{ fontFamily: FM, background: "#1a1c22", border: "1px solid #2a2d38", padding: "1px 7px", borderRadius: 5, fontSize: "0.78em", color: "#7c85a2", whiteSpace: "nowrap", verticalAlign: "middle", margin: "0 1px" }}>{m[4]}</code>);
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts.length === 0 ? text : parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
  };

  // ── Block-level renderer ─────────────────────────────────────────────────
  const renderContent = (content: string) => {
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // blank line → small gap
      if (!trimmed) {
        elements.push(<div key={`g${i}`} style={{ height: 6 }} />);
        i++; continue;
      }

      // ── fenced code block ```
      if (trimmed.startsWith("```")) {
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          codeLines.push(lines[i]); i++;
        }
        i++; // consume closing ```
        elements.push(
          <pre key={`cb${i}`} style={{ fontFamily: FM, fontSize: 12, background: "#11131a", border: "1px solid #1e2228", borderRadius: 8, padding: "10px 14px", overflowX: "auto", margin: "10px 0", color: "#9ca3af", lineHeight: 1.6, whiteSpace: "pre" }}>
            {codeLines.join("\n")}
          </pre>
        );
        continue;
      }

      // ── horizontal rule ---
      if (/^[-*_]{3,}$/.test(trimmed)) {
        elements.push(<div key={`hr${i}`} style={{ height: 1, background: "#1e2228", margin: "14px 0" }} />);
        i++; continue;
      }

      // ── H1 # → section heading: purple uppercase + extending line
      if (line.startsWith("# ")) {
        elements.push(
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, margin: "18px 0 10px" }}>
            <span style={{ fontFamily: FK, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6c63ff", flexShrink: 0 }}>{renderInline(line.slice(2))}</span>
            <div style={{ flex: 1, height: 1, background: "#1e2228" }} />
          </div>
        );
        i++; continue;
      }

      // ── H2 ## → section heading (smaller)
      if (line.startsWith("## ")) {
        elements.push(
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 8px" }}>
            <span style={{ fontFamily: FK, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6c63ff", flexShrink: 0 }}>{renderInline(line.slice(3))}</span>
            <div style={{ flex: 1, height: 1, background: "#1e2228" }} />
          </div>
        );
        i++; continue;
      }

      // ── H3 ###
      if (line.startsWith("### ")) {
        elements.push(<p key={i} style={{ fontFamily: FK, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.32)", marginTop: 14, marginBottom: 6 }}>{line.slice(4)}</p>);
        i++; continue;
      }

      // ── standalone **bold line** (entire line wrapped in **)
      if (/^\*\*[^*].+[^*]\*\*$/.test(trimmed) || /^\*\*\S+\*\*$/.test(trimmed)) {
        elements.push(<p key={i} style={{ fontFamily: FK, fontSize: 14, fontWeight: 700, color: "#e8e9eb", marginBottom: 4 }}>{trimmed.slice(2, -2)}</p>);
        i++; continue;
      }

      // ── table
      if (trimmed.startsWith("|")) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) { tableLines.push(lines[i]); i++; }
        elements.push(
          <div key={`t${i}`} style={{ overflowX: "auto", margin: "10px 0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: FK }}>
              <tbody>
                {tableLines.map((row, ri) => {
                  if (row.replace(/[|\s\-]/g, "") === "") return null;
                  const cells = row.split("|").slice(1, -1);
                  const isHeader = ri === 0;
                  return (
                    <tr key={ri} style={{ borderBottom: "1px solid #1e2228" }}>
                      {cells.map((cell, ci) => (
                        <td key={ci} style={{ padding: "7px 10px", color: isHeader ? "#6c63ff" : "#9ca3af", fontWeight: isHeader ? 600 : 400, fontSize: isHeader ? 10 : 13, textTransform: isHeader ? "uppercase" : "none", letterSpacing: isHeader ? "0.06em" : "0", whiteSpace: "nowrap", fontFamily: isHeader ? FK : FK }}>
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

      // ── numbered list  1. / 2.
      const numMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
      if (numMatch) {
        elements.push(
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
            <span style={{ fontFamily: FM, fontSize: 11, color: "#6c63ff", lineHeight: 1.7, flexShrink: 0, minWidth: 18, fontWeight: 500, opacity: 0.8 }}>{numMatch[1]}.</span>
            <span style={{ fontFamily: FK, fontSize: 14, color: "#9ca3af", lineHeight: 1.6, fontWeight: 400 }}>{renderInline(numMatch[2])}</span>
          </div>
        );
        i++; continue;
      }

      // ── bullet list  - / * / •
      if (/^[-•*]\s/.test(trimmed)) {
        const indent = line.search(/\S/);
        const isNested = indent >= 2;
        elements.push(
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start", paddingLeft: isNested ? 18 : 0 }}>
            <div style={{ width: isNested ? 3 : 5, height: isNested ? 3 : 5, borderRadius: "50%", background: isNested ? "rgba(108,99,255,0.3)" : "#6c63ff", marginTop: 8, flexShrink: 0, opacity: isNested ? 0.5 : 0.7 }} />
            <span style={{ fontFamily: FK, fontSize: 14, color: "#9ca3af", lineHeight: 1.6, fontWeight: 400 }}>{renderInline(trimmed.replace(/^[-•*]\s/, ""))}</span>
          </div>
        );
        i++; continue;
      }

      // ── plain paragraph
      elements.push(
        <p key={i} style={{ fontFamily: FK, fontSize: 14, color: "#9ca3af", lineHeight: 1.7, marginBottom: 4, fontWeight: 400 }}>
          {renderInline(line)}
        </p>
      );
      i++;
    }
    return elements;
  };

  return (
    <div className="traderai-root" style={{ display: "flex", height: "100%", minHeight: "calc(100dvh - 84px)", background: "#070d15", borderRadius: 0, overflow: "hidden", border: "none", fontFamily: F, position: "relative" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Kalam:wght@300;400;700&family=JetBrains+Mono:wght@400;500&display=swap');
        @keyframes traderai-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes traderai-spin   { to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .traderai-msg-block{animation:fadeUp 0.35s ease both}
        .traderai-scroll::-webkit-scrollbar{width:4px}
        .traderai-scroll::-webkit-scrollbar-track{background:transparent}
        .traderai-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:10px}
        .traderai-ta::placeholder{color:rgba(255,255,255,0.2);font-family:'Montserrat',sans-serif;}
        .traderai-chatrow .traderai-chatactions{opacity:0;transition:opacity .15s}
        .traderai-chatrow:hover .traderai-chatactions{opacity:1}

        /* ── Mobile optimisation ─────────────────────────────────────── */
        @media (max-width: 640px) {
          .traderai-root { height: 100% !important; min-height: calc(100dvh - 64px) !important; border-radius: 0 !important; }

          /* Sidebar slides out as an overlay; hidden by default */
          .traderai-sidebar {
            position: absolute !important;
            top: 0; left: 0; bottom: 0;
            width: 80vw !important; max-width: 280px;
            z-index: 30;
            transform: translateX(-100%);
            transition: transform 0.22s ease;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          }
          .traderai-sidebar.is-open { transform: translateX(0); }
          .traderai-sidebar-collapsed { display: none !important; }
          .traderai-sidebar-backdrop {
            position: absolute; inset: 0; z-index: 20;
            background: rgba(0,0,0,0.45);
          }

          /* Header tightens up */
          .traderai-header { padding: 0 10px !important; height: 46px !important; }
          .traderai-subtitle { display: none !important; }
          .traderai-headerbtn-label { display: none !important; }
          .traderai-headerbtn { padding: 6px !important; min-width: 28px; justify-content: center !important; }

          /* Empty state — single column suggestions */
          .traderai-empty-grid { grid-template-columns: 1fr !important; max-width: 100% !important; }
          .traderai-empty-wrap { padding: 20px 14px !important; }
          .traderai-empty-title { font-size: 18px !important; }
          .traderai-empty-sub { font-size: 12px !important; margin-bottom: 18px !important; }

          /* Tighter message padding */
          .traderai-msglist { padding: 16px 12px 6px !important; }

          /* Input bar */
          .traderai-inputwrap { padding: 8px 10px 10px !important; }
          .traderai-inputbox  { padding: 6px 6px 6px 10px !important; }

          /* Mobile-only sidebar toggle button shown in header */
          .traderai-mobile-toggle { display: inline-flex !important; }
        }
        .traderai-mobile-toggle { display: none; }
      `}</style>

      {/* Mobile sidebar backdrop */}
      {mobileSidebarOpen && <div className="traderai-sidebar-backdrop" onClick={() => setMobileSidebarOpen(false)} />}

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <div className={`traderai-sidebar ${mobileSidebarOpen ? "is-open" : ""} ${sidebarCollapsed ? "traderai-sidebar-collapsed" : ""}`}
        style={{ width: sidebarCollapsed ? 52 : 240, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,0.06)", background: "rgba(7,13,21,0.97)", display: "flex", flexDirection: "column", transition: "width 0.2s ease" }}>
        <div style={{ padding: "12px 10px 8px", display: "flex", alignItems: "center", gap: 6 }}>
          {!sidebarCollapsed && (
            <button onClick={newChat}
              style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", borderRadius: 9, color: "white", fontFamily: F, fontSize: 12, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 14px rgba(99,102,241,0.25)" }}
            >
              <Plus size={13} />
              <span>New chat</span>
            </button>
          )}
          <button onClick={() => setSidebarCollapsed(v => !v)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{ width: 32, height: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "rgba(255,255,255,0.55)", cursor: "pointer" }}
            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(255,255,255,0.09)"; b.style.color = "rgba(255,255,255,0.85)"; }}
            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(255,255,255,0.04)"; b.style.color = "rgba(255,255,255,0.55)"; }}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        </div>

        {!sidebarCollapsed && (
        <div className="traderai-scroll" style={{ flex: 1, overflowY: "auto", padding: "4px 8px 12px" }}>
          {chatsLoading && chats.length === 0 ? (
            <p style={{ fontFamily: F, fontSize: 11, color: "rgba(255,255,255,0.25)", padding: "12px 8px" }}>Loading…</p>
          ) : chats.length === 0 ? (
            <p style={{ fontFamily: F, fontSize: 11, color: "rgba(255,255,255,0.25)", padding: "12px 8px", lineHeight: 1.5 }}>
              No saved chats yet. Start a new conversation — it'll be saved automatically.
            </p>
          ) : (
            chats.map(c => {
              const isActive = c.id === activeChatId;
              const isRenaming = renamingId === c.id;
              return (
                <div key={c.id} className="traderai-chatrow"
                  onClick={() => !isRenaming && loadChat(c.id)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 7, marginBottom: 2, cursor: isRenaming ? "default" : "pointer", background: isActive ? "rgba(99,102,241,0.14)" : "transparent", border: isActive ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent", transition: "background 0.12s" }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                >
                  <MessageSquare size={12} color={isActive ? "#a5b4fc" : "rgba(255,255,255,0.35)"} style={{ flexShrink: 0 }} />
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") submitRename(c.id);
                        else if (e.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={() => submitRename(c.id)}
                      onClick={e => e.stopPropagation()}
                      style={{ flex: 1, minWidth: 0, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(99,102,241,0.4)", borderRadius: 4, color: "white", fontFamily: F, fontSize: 12, padding: "2px 6px", outline: "none" }}
                    />
                  ) : (
                    <span style={{ flex: 1, minWidth: 0, fontFamily: F, fontSize: 12, color: isActive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.6)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: isActive ? 500 : 400 }}>
                      {c.title}
                    </span>
                  )}
                  {!isRenaming && (
                    <div className="traderai-chatactions" style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); setRenameValue(c.title); setRenamingId(c.id); }}
                        style={{ width: 22, height: 22, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.8)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)"; }}
                        title="Rename"
                      ><Pencil size={11} /></button>
                      <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(c.id); }}
                        style={{ width: 22, height: 22, borderRadius: 5, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.15)"; (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)"; }}
                        title="Delete"
                      ><Trash2 size={11} /></button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        )}
      </div>

      {/* ── Main column ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div className="traderai-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: 52, background: "rgba(7,13,21,0.97)", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <button
              className="traderai-mobile-toggle"
              onClick={() => setMobileSidebarOpen(true)}
              title="Open chats"
              style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
            >
              <PanelLeftOpen size={14} />
            </button>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AtomAI size={14} color="white" />
            </div>
            <span style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", letterSpacing: "-0.02em" }}>Trader AI</span>
            <span className="traderai-subtitle" style={{ fontFamily: F, fontSize: 11, color: "rgba(255,255,255,0.22)", fontWeight: 400 }}>Your Personal Trading Coach</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            {messages.length > 0 && (
              <>
                {[
                  { label: "Export", icon: <FileText size={12} />, action: exportChat },
                  { label: "Clear",  icon: <RotateCcw size={12} />, action: newChat },
                ].map(({ label, icon, action }) => (
                  <button key={label} onClick={action} className="traderai-headerbtn" title={label}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: F, transition: "all 0.15s" }}
                    onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(255,255,255,0.09)"; b.style.color = "rgba(255,255,255,0.7)"; }}
                    onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(255,255,255,0.05)"; b.style.color = "rgba(255,255,255,0.45)"; }}
                  >
                    {icon}<span className="traderai-headerbtn-label">{label}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Scrollable messages / empty state */}
        <div className="traderai-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {messages.length === 0 ? (
            <div className="traderai-empty-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100%", padding: "32px 20px", textAlign: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, boxShadow: "0 0 48px rgba(99,102,241,0.25)" }}>
                <AtomAI size={22} color="white" />
              </div>
              <h2 className="traderai-empty-title" style={{ fontFamily: F, fontSize: 21, fontWeight: 700, color: "rgba(255,255,255,0.92)", letterSpacing: "-0.04em", marginBottom: 8, lineHeight: 1.2 }}>
                How can I analyse<br />your trades today?
              </h2>
              <p className="traderai-empty-sub" style={{ fontFamily: F, fontSize: 13, color: "rgba(255,255,255,0.3)", lineHeight: 1.65, maxWidth: 340, marginBottom: 28, fontWeight: 400 }}>
                Connected to your TradeLog database. Ask me anything about your performance, patterns, and edge.
              </p>
              <div className="traderai-empty-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%", maxWidth: 600 }}>
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
            <div className="traderai-msglist" style={{ padding: "24px 24px 8px", maxWidth: 780, margin: "0 auto", width: "100%" }}>
              {messages.map((msg, idx) => {
                const isLastMsg = idx === messages.length - 1;
                return (
                  <div key={idx} className="traderai-msg-block" style={{ animationDelay: `${idx * 0.05}s` }}>
                    {msg.role === "user" ? (
                      <div style={{ display: "flex", justifyContent: "flex-end", padding: "1.2rem 0 0.8rem" }}>
                        <div style={{ background: "#1e2228", border: "1px solid #2a2d38", borderRadius: 20, padding: "10px 18px", fontFamily: FK, fontSize: 14, color: "#d1d5db", maxWidth: "75%", lineHeight: 1.55 }}>
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: "0.25rem 0 1.8rem", borderBottom: isLastMsg && !loading ? "none" : "1px solid #1a1c22" }}>
                        {renderContent(msg.content)}
                        <div style={{ display: "flex", gap: 4, marginTop: 10 }}
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
                    )}
                  </div>
                );
              })}
              {loading && (
                <div style={{ padding: "1rem 0 1.5rem" }}>
                  <div style={{ display: "flex", gap: 5 }}>
                    {[0, 1, 2].map(d => (
                      <div key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.22)", animation: `traderai-bounce 1.2s ${d * 0.18}s ease-in-out infinite` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} style={{ height: 1 }} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="traderai-inputwrap" style={{ flexShrink: 0, padding: "12px 16px 14px", background: "rgba(7,13,21,0.97)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 8, marginBottom: 8 }}>
              <AlertCircle size={12} color="#f87171" />
              <span style={{ fontFamily: F, fontSize: 12, color: "#f87171" }}>{error}</span>
            </div>
          )}
          <div className="traderai-inputbox" style={{ display: "flex", alignItems: "flex-end", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 12, padding: "8px 8px 8px 14px", transition: "border-color 0.15s, box-shadow 0.15s" }}
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

      {/* ── Delete confirmation modal ─────────────────────────────── */}
      {confirmDeleteId && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
          onClick={() => setConfirmDeleteId(null)}>
          <div style={{ background: "#0f1923", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "28px 28px 22px", width: 320, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.6)", fontFamily: F }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Trash2 size={16} color="#f87171" />
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>Delete conversation?</span>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, margin: "0 0 22px" }}>
              This conversation and all its messages will be permanently removed. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDeleteId(null)}
                style={{ padding: "7px 18px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>
                Cancel
              </button>
              <button onClick={() => deleteChat(confirmDeleteId)}
                style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#dc2626,#b91c1c)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: F, boxShadow: "0 2px 12px rgba(220,38,38,0.35)" }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
