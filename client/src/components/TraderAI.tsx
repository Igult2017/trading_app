import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Copy, Check, Download,
  ChevronRight, AlertCircle,
  Plus, Trash2, MessageSquare, Pencil
} from "lucide-react";
import { authFetch } from "@/lib/queryClient";

const GEMINI_MODELS = [
  { id: "gemini-1.5-flash",               label: "1.5 Flash",         desc: "Fast · stable" },
  { id: "gemini-1.5-pro",                 label: "1.5 Pro",           desc: "Powerful · stable" },
  { id: "gemini-2.0-flash-lite",          label: "2.0 Flash Lite",    desc: "Newer · efficient" },
  { id: "gemini-2.5-flash-preview-05-20", label: "2.5 Flash Preview", desc: "Latest Flash" },
  { id: "gemini-2.5-pro-preview-05-06",   label: "2.5 Pro Preview",   desc: "Most capable" },
] as const;
type GeminiModelId = (typeof GEMINI_MODELS)[number]["id"];
const DEFAULT_MODEL: GeminiModelId = "gemini-1.5-flash";



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
const FK = "'Inter', sans-serif";         // AI response body
const FM = "'JetBrains Mono', monospace"; // inline code chips

interface Message { role: "user" | "model"; content: string; }
interface ChatSummary {
  id: string;
  title: string;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function TraderAI({ sessionId, darkMode = true }: { sessionId?: string; darkMode?: boolean }) {
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
  const SIDEBAR_MIN = 180;
  const SIDEBAR_MAX = 440;
  const SIDEBAR_SNAP = 100; // collapse when dragged below this
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 240;
    const v = parseInt(window.localStorage.getItem("traderai.sidebarWidth") ?? "240", 10);
    return isNaN(v) ? 240 : v;
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const sidebarCollapsed = sidebarWidth < SIDEBAR_MIN;
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<GeminiModelId>(() => {
    try { return (window.localStorage.getItem("traderai.model") as GeminiModelId) || DEFAULT_MODEL; } catch { return DEFAULT_MODEL; }
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    try { window.localStorage.setItem("traderai.sidebarWidth", String(sidebarWidth)); } catch { /* ignore */ }
  }, [sidebarWidth]);

  // ── Drag-to-resize handlers ───────────────────────────────────────────────
  const onDragHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: sidebarWidth };
    setIsDragging(true);
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientX - dragRef.current.startX;
      const raw = dragRef.current.startW + delta;
      if (raw < SIDEBAR_SNAP) {
        setSidebarWidth(0);
      } else {
        setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, raw)));
      }
    };
    const onUp = () => {
      dragRef.current = null;
      setIsDragging(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [sidebarWidth, SIDEBAR_SNAP, SIDEBAR_MIN, SIDEBAR_MAX]);
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

  // Click-outside dismisses the armed delete button — same pattern as Trade Vault
  useEffect(() => {
    if (!confirmDeleteId) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest(".tai-delete-btn")) {
        setConfirmDeleteId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [confirmDeleteId]);

  // Inject Google Fonts into <head> so they load reliably regardless of global styles
  useEffect(() => {
    const id = "traderai-gfonts";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap";
      document.head.appendChild(link);
    }
  }, []);

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
      if (reply) {
        setMessages([...next, { role: "model", content: reply }]);
        refreshChats();
      } else {
        setMessages(next);
      }
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

  // ── Inline markdown parser: **bold**, *italic*, `code`, [TEXT]{ok|warn|danger} ──
  const renderInline = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    // Order matters: badges before bold before italic before code
    const re = /(\[([^\]]+)\]\{(ok|warn|danger)\}|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
    let last = 0, m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      if (m[0].startsWith("[")) {
        // Colored badge: [TEXT]{ok|warn|danger}
        const variant = m[3] as "ok" | "warn" | "danger";
        parts.push(
          <span key={m.index} className={`tai-badge tai-badge-${variant}`}>{m[2]}</span>
        );
      } else if (m[0].startsWith("**"))
        parts.push(<strong key={m.index} className="tai-hl">{m[4]}</strong>);
      else if (m[0].startsWith("*"))
        parts.push(<em key={m.index} style={{ fontStyle: "italic", color: "rgba(255,255,255,0.55)" }}>{m[5]}</em>);
      else
        parts.push(<code key={m.index} className="tai-chip">{m[6]}</code>);
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
        i++;
        elements.push(<pre key={`cb${i}`} className="tai-pre">{codeLines.join("\n")}</pre>);
        continue;
      }

      // ── horizontal rule ---
      if (/^[-*_]{3,}$/.test(trimmed)) {
        elements.push(<div key={`hr${i}`} className="tai-rule" />);
        i++; continue;
      }

      // ── H1 # → section heading
      if (line.startsWith("# ")) {
        elements.push(<div key={i} className="tai-section-heading">{renderInline(line.slice(2))}</div>);
        i++; continue;
      }

      // ── H2 ##
      if (line.startsWith("## ")) {
        elements.push(<div key={i} className="tai-section-heading">{renderInline(line.slice(3))}</div>);
        i++; continue;
      }

      // ── H3 ###
      if (line.startsWith("### ")) {
        elements.push(<p key={i} style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.32)", marginTop: 14, marginBottom: 6 }}>{line.slice(4)}</p>);
        i++; continue;
      }

      // ── bullet where entire content is bold label ending in ":" → section heading
      // e.g. "- **Instrument:**" or "* **Session:**"
      const bulletLabelMatch = trimmed.match(/^[-•*]\s+\*\*([^*]+:?)\*\*\s*:?\s*$/);
      if (bulletLabelMatch) {
        elements.push(<div key={i} className="tai-section-heading">{bulletLabelMatch[1].replace(/:$/, "")}</div>);
        i++; continue;
      }

      // ── standalone **bold line** (entire line wrapped in **)
      if (/^\*\*[^*].+[^*]\*\*[:.]*$/.test(trimmed) || /^\*\*\S+\*\*[:.]*$/.test(trimmed)) {
        const inner = trimmed.replace(/^\*\*/, "").replace(/\*\*[:.]*$/, "");
        // If it looks like a label (ends with colon) → section heading, otherwise bold paragraph
        if (inner.endsWith(":")) {
          elements.push(<div key={i} className="tai-section-heading">{inner.slice(0, -1)}</div>);
        } else {
          elements.push(<p key={i} className="tai-bold-line">{inner}</p>);
        }
        i++; continue;
      }

      // ── table
      if (trimmed.startsWith("|")) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) { tableLines.push(lines[i]); i++; }
        elements.push(
          <div key={`t${i}`} style={{ overflowX: "auto", margin: "10px 0" }}>
            <table className="tai-table">
              <tbody>
                {tableLines.map((row, ri) => {
                  if (row.replace(/[|\s\-]/g, "") === "") return null;
                  const cells = row.split("|").slice(1, -1);
                  return (
                    <tr key={ri}>
                      {cells.map((cell, ci) => (
                        <td key={ci}>{cell.trim()}</td>
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
          <div key={i} className="tai-num-row">
            <span className="tai-num">{numMatch[1]}.</span>
            <span className="tai-point-item" style={{ display: "block", padding: 0 }}>{renderInline(numMatch[2])}</span>
          </div>
        );
        i++; continue;
      }

      // ── blockquote  > text → footer note style
      if (trimmed.startsWith("> ")) {
        // Collect consecutive blockquote lines
        const bqLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith("> ")) {
          bqLines.push(lines[i].trim().slice(2));
          i++;
        }
        elements.push(
          <div key={`bq${i}`} className="tai-footer-note">
            {bqLines.map((bl, bi) => (
              <span key={bi} style={{ display: "block" }}>{renderInline(bl)}</span>
            ))}
          </div>
        );
        continue;
      }

      // ── bullet list  - / * / •
      if (/^[-•*]\s/.test(trimmed)) {
        const indent = line.search(/\S/);
        const isNested = indent >= 2;
        elements.push(
          <div key={i} className="tai-point-item" style={{ marginBottom: 8, paddingLeft: isNested ? 18 : 0 }}>
            <span className="tai-point-dot" style={{ width: isNested ? 3 : 5, height: isNested ? 3 : 5, opacity: isNested ? 0.4 : 0.7 }} />
            <span>{renderInline(trimmed.replace(/^[-•*]\s/, ""))}</span>
          </div>
        );
        i++; continue;
      }

      // ── plain paragraph
      elements.push(<p key={i} className="tai-p">{renderInline(line)}</p>);
      i++;
    }
    return elements;
  };

  const dm        = darkMode;
  const panelBg   = dm ? "rgba(7,13,21,0.97)"    : "#ffffff";
  const borderC   = dm ? "rgba(255,255,255,0.06)" : "#e2e8f0";
  const textPrim  = dm ? "rgba(255,255,255,0.90)" : "#0f172a";
  const textMut   = dm ? "rgba(255,255,255,0.22)" : "#64748b";
  const textDim   = dm ? "rgba(255,255,255,0.15)" : "#94a3b8";
  const suggBg    = dm ? "rgba(255,255,255,0.03)" : "#f8fafc";
  const suggBd    = dm ? "rgba(255,255,255,0.08)" : "#e2e8f0";
  const suggText  = dm ? "rgba(255,255,255,0.55)" : "#475569";
  const inputBg   = dm ? "rgba(255,255,255,0.05)" : "#f1f5f9";
  const inputBd   = dm ? "rgba(255,255,255,0.09)" : "#e2e8f0";
  const taColor   = dm ? "rgba(255,255,255,0.88)" : "#0f172a";

  return (
    <div className="traderai-root" style={{ display: "flex", height: "100%", minHeight: "calc(100dvh - 84px)", background: dm ? "#070d15" : "var(--jr-bg, #EEF2F7)", borderRadius: 0, overflow: "hidden", border: "none", fontFamily: F, position: "relative" }}>

      <style>{`
        @keyframes traderai-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes traderai-spin   { to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .traderai-msg-block{animation:fadeUp 0.35s ease both}
        .traderai-scroll::-webkit-scrollbar{width:4px}
        .traderai-scroll::-webkit-scrollbar-track{background:transparent}
        .traderai-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:10px}
        .traderai-ta::placeholder{color:${dm ? "rgba(255,255,255,0.2)" : "#94a3b8"};font-family:'Montserrat',sans-serif;}
        .traderai-chatrow .traderai-chatactions{opacity:0;transition:opacity .15s}
        .traderai-chatrow:hover .traderai-chatactions{opacity:1}
        .tai-delete-btn{background:none;border:none;cursor:pointer;color:rgba(255,255,255,0.4);transition:color .2s,transform .2s,background .2s;padding:4px;border-radius:5px;display:flex;align-items:center;justify-content:center;gap:3px;width:22px;height:22px;flex-shrink:0;}
        .tai-delete-btn:hover{color:#f87171;background:rgba(239,68,68,0.15);}
        .tai-delete-btn--confirm{color:#ff4d6d !important;background:rgba(255,77,109,0.15) !important;border:1px solid rgba(255,77,109,0.35) !important;width:auto !important;padding:3px 6px !important;animation:tai-pulse-red 0.6s ease-in-out infinite alternate;}
        .tai-delete-btn--confirm:hover{background:rgba(255,77,109,0.28) !important;}
        @keyframes tai-pulse-red{from{box-shadow:0 0 0 0 rgba(255,77,109,0.0);}to{box-shadow:0 0 6px 2px rgba(255,77,109,0.25);}}

        /* ── AI response content classes ──────────────────────────────── */
        .tai-feed,.tai-feed *{font-family:'Inter',sans-serif !important;}
        .tai-feed code,.tai-feed pre,.tai-chip{font-family:'JetBrains Mono',monospace !important;}
        .tai-user-pill{background:#1e2228;border:1px solid #2a2d38;border-radius:20px;padding:10px 18px;font-size:14px;color:#d1d5db;max-width:75%;line-height:1.5;}
        .tai-ai-row{padding:0.25rem 0 2rem;border-bottom:1px solid #1a1c22;font-size:14px;line-height:1.7;color:#c9ccd4;}
        .tai-ai-row:last-child{border-bottom:none;}
        .tai-section-heading{font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6c63ff;margin:16px 0 10px;display:flex;align-items:center;gap:6px;}
        .tai-section-heading:first-child{margin-top:0;}
        .tai-section-heading::after{content:'';flex:1;height:1px;background:#1e2228;}
        .tai-point-list{list-style:none;display:flex;flex-direction:column;gap:8px;padding:0;}
        .tai-point-item{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.6;color:#9ca3af;}
        .tai-point-dot{width:5px;height:5px;border-radius:50%;background:#6c63ff;flex-shrink:0;margin-top:8px;opacity:0.7;}
        .tai-chip{display:inline-flex;align-items:center;font-size:11px;background:#1a1c22;border:1px solid #2a2d38;border-radius:5px;padding:1px 7px;color:#7c85a2;vertical-align:middle;margin:0 1px;white-space:nowrap;}
        .tai-badge{display:inline-flex;align-items:center;font-size:10.5px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;border-radius:5px;padding:2px 7px;vertical-align:middle;margin:0 1px;}
        .tai-badge-warn{background:#2a1f0a;color:#f59e0b;border:1px solid #3d2e10;}
        .tai-badge-danger{background:#200f0f;color:#f87171;border:1px solid #3d1818;}
        .tai-badge-ok{background:#0d1f12;color:#34d399;border:1px solid #163324;}
        .tai-hl{color:#e8e9eb;font-weight:600;}
        .tai-rule{height:1px;background:#1e2228;margin:14px 0;}
        .tai-footer-note{margin-top:12px;padding:10px 14px;background:#11131a;border-left:2px solid #6c63ff;border-radius:0 8px 8px 0;font-size:13px;color:#6b7280;line-height:1.65;}
        .tai-pre{font-size:12px;background:#11131a;border:1px solid #1e2228;border-radius:8px;padding:10px 14px;overflow-x:auto;margin:10px 0;color:#9ca3af;line-height:1.6;white-space:pre;}
        .tai-p{font-size:14px;color:#9ca3af;line-height:1.7;margin-bottom:4px;}
        .tai-bold-line{font-size:14px;font-weight:700;color:#e8e9eb;margin-bottom:4px;}
        .tai-num-row{display:flex;gap:10px;margin-bottom:8px;align-items:flex-start;}
        .tai-num{font-size:11px;color:#6c63ff;line-height:1.7;flex-shrink:0;min-width:18px;font-weight:500;opacity:0.8;font-family:'JetBrains Mono',monospace !important;}
        .tai-table{width:100%;border-collapse:collapse;font-size:14px;}
        .tai-table td{padding:7px 10px;border-bottom:1px solid #1e2228;color:#9ca3af;}
        .tai-table tr:first-child td{color:#6c63ff;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;}

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
          .traderai-empty-title { font-size: 13px !important; }
          .traderai-empty-sub { font-size: 7px !important; margin-bottom: 18px !important; }

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
      {/* Collapsed strip — drag to reopen */}
      {sidebarCollapsed && !mobileSidebarOpen && (
        <div
          onMouseDown={onDragHandleMouseDown}
          title="Drag to expand sidebar"
          style={{ width: 14, flexShrink: 0, background: panelBg, borderRight: `1px solid ${borderC}`, cursor: "col-resize", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[0,1,2].map(i => <div key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.2)" }} />)}
          </div>
        </div>
      )}

      <div className={`traderai-sidebar ${mobileSidebarOpen ? "is-open" : ""}`}
        style={{ width: sidebarCollapsed ? 0 : sidebarWidth, flexShrink: 0, background: darkMode ? "rgba(7,13,21,0.97)" : "var(--jr-panel, #F1F5F9)", display: sidebarCollapsed ? "none" : "flex", flexDirection: "column", transition: isDragging ? "none" : "width 0.18s ease", overflow: "hidden", position: "relative" }}>

        {/* Drag handle — right edge of sidebar */}
        <div
          onMouseDown={onDragHandleMouseDown}
          title="Drag to resize"
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 5, cursor: "col-resize", zIndex: 10, background: isDragging ? "rgba(99,102,241,0.35)" : "transparent", transition: "background 0.15s" }}
          onMouseEnter={e => { if (!isDragging) (e.currentTarget as HTMLDivElement).style.background = "rgba(99,102,241,0.18)"; }}
          onMouseLeave={e => { if (!isDragging) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
        />

        {/* Sidebar border line */}
        <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 1, background: borderC, pointerEvents: "none" }} />

        <div style={{ padding: "12px 10px 8px", display: "flex", alignItems: "center", gap: 6, paddingRight: 14 }}>
          <button onClick={newChat}
            style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", borderRadius: 9, color: "white", fontFamily: F, fontSize: 12, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 14px rgba(99,102,241,0.25)", whiteSpace: "nowrap", overflow: "hidden" }}
          >
            <Plus size={13} style={{ flexShrink: 0 }} />
            <span>New chat</span>
          </button>
        </div>

        {(
        <div className="traderai-scroll" style={{ flex: 1, overflowY: "auto", padding: "4px 8px 12px", paddingRight: 12 }}>
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
                      {confirmDeleteId === c.id ? (
                        <button
                          className="tai-delete-btn tai-delete-btn--confirm"
                          onClick={e => { e.stopPropagation(); deleteChat(c.id); }}
                          title="Confirm delete"
                        >
                          <Trash2 size={10} />
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", lineHeight: 1, fontFamily: F }}>DEL?</span>
                        </button>
                      ) : (
                        <button
                          className="tai-delete-btn"
                          onClick={e => { e.stopPropagation(); setConfirmDeleteId(c.id); }}
                          title="Delete conversation"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
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
        <div className="traderai-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: 52, background: panelBg, borderBottom: `1px solid ${borderC}`, flexShrink: 0, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: textPrim, letterSpacing: "-0.02em" }}>Trader AI</span>
            <span className="traderai-subtitle" style={{ fontFamily: F, fontSize: 11, color: textMut, fontWeight: 400 }}>Your Personal Trading Coach</span>
          </div>
        </div>

        {/* Scrollable messages / empty state */}
        <div className="traderai-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {messages.length === 0 ? (
            <div className="traderai-empty-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100%", padding: "40px 32px", textAlign: "center" }}>
              <h2 className="traderai-empty-title" style={{ fontFamily: F, fontSize: 13, fontWeight: 800, color: textPrim, letterSpacing: "-0.03em", marginBottom: 8, lineHeight: 1.15 }}>
                How can I analyse your trades today?
              </h2>
              <p className="traderai-empty-sub" style={{ fontFamily: F, fontSize: 7, fontWeight: 400, color: textMut, marginBottom: 30, maxWidth: 540, lineHeight: 1.6 }}>
                Ask anything about your journal — I read your real trade data to surface your edge, your leaks, and your best setups.
              </p>
              <div className="traderai-empty-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 28, rowGap: 12, width: "100%", maxWidth: 940 }}>
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => send(s)}
                    style={{ padding: "16px 18px", background: suggBg, border: `1px solid ${suggBd}`, borderRadius: 14, color: suggText, fontSize: 13, fontFamily: F, fontWeight: 400, cursor: "pointer", textAlign: "left", lineHeight: 1.5, transition: "transform 0.18s, background 0.18s, border-color 0.18s, box-shadow 0.18s, color 0.18s", display: "flex", alignItems: "center", gap: 12 }}
                    onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(99,102,241,0.08)"; b.style.borderColor = "rgba(99,102,241,0.35)"; b.style.color = dm ? "rgba(255,255,255,0.85)" : "#1e293b"; b.style.transform = "translateY(-2px)"; b.style.boxShadow = "0 8px 22px rgba(99,102,241,0.18)"; }}
                    onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = suggBg; b.style.borderColor = suggBd; b.style.color = suggText; b.style.transform = "translateY(0)"; b.style.boxShadow = "none"; }}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <ChevronRight size={13} color="#818cf8" />
                    </div>
                    <span style={{ fontFamily: F, flex: 1 }}>{s}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="traderai-msglist tai-feed" style={{ padding: "24px 24px 8px", maxWidth: 780, margin: "0 auto", width: "100%" }}>
              {messages.map((msg, idx) => {
                const isLastMsg = idx === messages.length - 1;
                return (
                  <div key={idx} className="traderai-msg-block" style={{ animationDelay: `${idx * 0.05}s` }}>
                    {msg.role === "user" ? (
                      <div style={{ display: "flex", justifyContent: "flex-end", padding: "1.2rem 0 0.8rem" }}>
                        <div className="tai-user-pill">{msg.content}</div>
                      </div>
                    ) : (
                      <div className="tai-ai-row" style={{ borderBottom: isLastMsg && !loading ? "none" : undefined }}>
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
                <div className="tai-ai-row" style={{ borderBottom: "none" }}>
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
        <div className="traderai-inputwrap" style={{ flexShrink: 0, padding: "12px 16px 14px", background: panelBg, borderTop: `1px solid ${borderC}` }}>
          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 8, marginBottom: 8 }}>
              <AlertCircle size={12} color="#f87171" />
              <span style={{ fontFamily: F, fontSize: 12, color: "#f87171" }}>{error}</span>
            </div>
          )}
          <div className="traderai-inputbox" style={{ display: "flex", alignItems: "flex-end", background: inputBg, border: `1px solid ${inputBd}`, borderRadius: 12, padding: "8px 8px 8px 14px", transition: "border-color 0.15s, box-shadow 0.15s" }}
            onFocusCapture={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = "rgba(99,102,241,0.45)"; d.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.1)"; }}
            onBlurCapture={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = inputBd; d.style.boxShadow = "none"; }}
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
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", resize: "none", fontFamily: F, fontSize: 14, fontWeight: 400, color: taColor, lineHeight: 1.55, minHeight: 28, maxHeight: 160, padding: 0 }}
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
          <p style={{ fontFamily: F, textAlign: "center", fontSize: 10, fontWeight: 400, color: textDim, marginTop: 6 }}>
            Trader AI can make mistakes. Verify important insights independently.
          </p>
        </div>
      </div>

    </div>
  );
}
