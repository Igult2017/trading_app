import { useState, useRef, useCallback, useEffect } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const BLOG_CATEGORIES = [
  { value: "Equities",              label: "Equities",              sub: "Stocks & indices"    },
  { value: "Forex",                 label: "Forex",                 sub: "Currency pairs"      },
  { value: "Digital Assets",        label: "Digital Assets",        sub: "Crypto & DeFi"       },
  { value: "Analysis",              label: "Analysis",              sub: "Market analysis"     },
  { value: "Backtested Strategies", label: "Backtested Strategies", sub: "Verified strategies" },
];

const EXPERTISE_OPTIONS = [
  "Technical Analysis","Fundamental Analysis","Forex","Crypto","Stocks",
  "Commodities","Scalping","Swing Trading","Risk Management","Price Action",
];

const SOCIAL_PLATFORMS = [
  { key: "twitter",  icon: "𝕏",  placeholder: "x.com/handle or @handle"    },
  { key: "linkedin", icon: "in", placeholder: "linkedin.com/in/name"        },
  { key: "telegram", icon: "✈",  placeholder: "@channel or profile"         },
];

// ─── Style helpers ────────────────────────────────────────────────────────────

const inputBase = (extra: Record<string, any> = {}) => ({
  background:   "rgba(255,255,255,0.04)",
  border:       "0.5px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  color:        "rgba(255,255,255,0.85)",
  fontFamily:   "'Geist', system-ui, sans-serif",
  fontSize:     12,
  padding:      "7px 10px",
  outline:      "none",
  width:        "100%",
  boxSizing:    "border-box" as const,
  ...extra,
});

const focusOn  = (e: any) => { e.target.style.borderColor = "rgba(99,153,34,0.5)";   e.target.style.background = "rgba(255,255,255,0.07)"; };
const focusOff = (e: any) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.background = "rgba(255,255,255,0.04)"; };

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function SidebarLabel({ children, style = {} }: { children: React.ReactNode; style?: any }) {
  return (
    <div style={{
      fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: "0.12em",
      textTransform: "uppercase" as const, color: "rgba(255,255,255,0.22)",
      padding: "10px 16px 5px", ...style,
    }}>
      {children}
    </div>
  );
}

function SidebarDivider() {
  return <div style={{ height: 0.5, background: "rgba(255,255,255,0.06)", margin: "8px 0" }} />;
}

function MainLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      fontSize: 11, fontFamily: "'DM Mono', monospace",
      color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em",
      textTransform: "uppercase" as const,
    }}>
      {children}
    </label>
  );
}

function MainField({ label, children, style = {} }: { label: string; children: React.ReactNode; style?: any }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 6, ...style }}>
      <MainLabel>{label}</MainLabel>
      {children}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontFamily: "'DM Mono', monospace", letterSpacing: "0.12em",
      textTransform: "uppercase" as const, color: "rgba(255,255,255,0.2)",
      borderBottom: "0.5px solid rgba(255,255,255,0.06)", paddingBottom: 8,
    }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 0.5, background: "rgba(255,255,255,0.06)" }} />;
}

function TrafficDots() {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {["#ff5f57", "#ffbd2e", "#28c840"].map((c, i) => (
        <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
      ))}
    </div>
  );
}

// ─── StatusToggle ─────────────────────────────────────────────────────────────

function StatusToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const chip = (v: string, label: string, colors: any, activeBorder: string) => {
    const active = value === v;
    return (
      <span
        onClick={() => onChange(v)}
        style={{
          fontSize: 11, fontFamily: "'DM Mono', monospace",
          padding: "3px 12px", borderRadius: 20,
          cursor: "pointer", border: "0.5px solid",
          transition: "all 0.15s", userSelect: "none" as const,
          background:  active ? colors.bg      : colors.bgOff,
          color:       active ? colors.text    : colors.textOff,
          borderColor: active ? activeBorder   : colors.borderOff,
        }}
      >
        {label}
      </span>
    );
  };
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.2)", marginRight: 4 }}>status</span>
      {chip("Draft", "Draft",
        { bg: "rgba(255,189,46,0.18)", bgOff: "rgba(255,189,46,0.05)", text: "#ffbd2e", textOff: "rgba(255,189,46,0.45)", borderOff: "rgba(255,189,46,0.18)" },
        "rgba(255,189,46,0.5)")}
      {chip("Published", "Published",
        { bg: "rgba(40,200,64,0.15)",  bgOff: "rgba(40,200,64,0.05)",  text: "#28c840", textOff: "rgba(40,200,64,0.4)",   borderOff: "rgba(40,200,64,0.12)"  },
        "rgba(40,200,64,0.4)")}
    </div>
  );
}

// ─── Sidebar destination item ─────────────────────────────────────────────────

function DestItem({ item, active, onClick }: { item: any; active: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "7px 16px", cursor: "pointer", transition: "background 0.12s",
        background: active ? "rgba(99,153,34,0.12)" : hov ? "rgba(255,255,255,0.04)" : "transparent",
      }}
    >
      <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: active ? "#7ab83e" : "rgba(255,255,255,0.2)" }} />
      <div>
        <div style={{ fontSize: 13, color: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)" }}>{item.label}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>{item.sub}</div>
      </div>
    </div>
  );
}

// ─── Sidebar author panel ─────────────────────────────────────────────────────

function SidebarAuthorPanel({ form, onChange }: { form: any; onChange: (partial: any) => void }) {
  const raw     = (form.authorName || "").trim();
  const parts   = raw.split(/\s+/).filter(Boolean);
  const initials = parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : raw.slice(0, 2).toUpperCase() || "AU";

  const toggleExpertise = (tag: string) =>
    onChange({
      authorExpertise: form.authorExpertise.includes(tag)
        ? form.authorExpertise.filter((t: string) => t !== tag)
        : [...form.authorExpertise, tag],
    });

  return (
    <div style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)", paddingTop: 4 }}>
      <SidebarLabel>Author</SidebarLabel>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 16px 10px" }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, #3b6d11, #639922)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 500, color: "#c0dd97",
        }}>
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {raw || "Author Name"}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>Post author</div>
        </div>
      </div>

      <div style={{ padding: "0 16px 8px" }}>
        <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.22)", marginBottom: 4 }}>Name</div>
        <input type="text" value={form.authorName} onChange={e => onChange({ authorName: e.target.value })}
          placeholder="Full name" style={inputBase()} onFocus={focusOn} onBlur={focusOff} />
      </div>

      <div style={{ padding: "0 16px 10px" }}>
        <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.22)", marginBottom: 4 }}>Short Bio</div>
        <textarea value={form.authorBio} onChange={e => onChange({ authorBio: e.target.value })}
          rows={3} placeholder="Brief description shown on your author card..."
          style={inputBase({ resize: "none", lineHeight: 1.55, fontSize: 11 })}
          onFocus={focusOn} onBlur={focusOff} />
      </div>

      <SidebarDivider />

      <SidebarLabel>Expertise</SidebarLabel>
      <div style={{ padding: "0 16px 10px", display: "flex", flexWrap: "wrap" as const, gap: 5 }}>
        {EXPERTISE_OPTIONS.map(tag => {
          const on = form.authorExpertise.includes(tag);
          return (
            <button key={tag} onClick={() => toggleExpertise(tag)} style={{
              background:   on ? "rgba(99,153,34,0.2)"  : "rgba(255,255,255,0.04)",
              border:       `0.5px solid ${on ? "rgba(99,153,34,0.55)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: 20, color: on ? "#a8d46f" : "rgba(255,255,255,0.38)",
              fontSize: 10, fontFamily: "'Geist', system-ui, sans-serif",
              padding: "4px 10px", cursor: "pointer", transition: "all 0.15s",
              whiteSpace: "nowrap" as const, lineHeight: 1.4,
            }}>
              {on && <span style={{ marginRight: 4, fontSize: 9 }}>✓</span>}
              {tag}
            </button>
          );
        })}
        {form.authorExpertise.length > 0 && (
          <div style={{ width: "100%", fontSize: 10, fontFamily: "'DM Mono', monospace", color: "rgba(99,153,34,0.55)", marginTop: 3 }}>
            {form.authorExpertise.length} selected
          </div>
        )}
      </div>

      <SidebarDivider />

      <SidebarLabel>Social Profiles <span style={{ color: "rgba(255,255,255,0.14)", fontWeight: 400 }}>(optional)</span></SidebarLabel>
      <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column" as const, gap: 7 }}>
        {SOCIAL_PLATFORMS.map(({ key, icon, placeholder }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 6, flexShrink: 0,
              background: "rgba(255,255,255,0.06)", border: "0.5px solid rgba(255,255,255,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, color: "rgba(255,255,255,0.5)",
              fontFamily: "'DM Mono', monospace", fontWeight: 500,
            }}>
              {icon}
            </div>
            <input type="text" value={form[`author${key.charAt(0).toUpperCase() + key.slice(1)}`] || ""}
              onChange={e => onChange({ [`author${key.charAt(0).toUpperCase() + key.slice(1)}`]: e.target.value })}
              placeholder={placeholder}
              style={inputBase({ flex: 1, width: "auto", fontSize: 11 })}
              onFocus={focusOn} onBlur={focusOff}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Content toolbar ───────────────────────────────────────────────────────────

function Toolbar({ contentRef, onUpdate }: { contentRef: React.RefObject<HTMLTextAreaElement>; onUpdate: (v: string) => void }) {
  const ins = useCallback((snippet: string) => {
    const ta = contentRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + snippet + ta.value.slice(e);
    ta.selectionStart = ta.selectionEnd = s + snippet.length;
    ta.focus();
    onUpdate(ta.value);
  }, [contentRef, onUpdate]);

  const tbtn: any = { background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: "4px 8px", borderRadius: 4, fontSize: 12, fontFamily: "'DM Mono', monospace", transition: "all 0.12s", lineHeight: 1 };
  const ho = (e: any) => { e.target.style.background = "rgba(255,255,255,0.07)"; e.target.style.color = "rgba(255,255,255,0.85)"; };
  const uo = (e: any) => { e.target.style.background = "none"; e.target.style.color = "rgba(255,255,255,0.4)"; };
  const sep = <div style={{ width: 0.5, height: 16, background: "rgba(255,255,255,0.1)", margin: "0 4px", flexShrink: 0 }} />;

  const items: any[] = [
    { l: <b>B</b>,  a: () => ins("\n**bold text**")                          },
    { l: <i>I</i>,  a: () => ins("\n_italic text_")                          },
    { l: "S̶",       a: () => ins("\n~~strikethrough~~")                      },
    null,
    { l: "H2",      a: () => ins("\n## Heading\n")                           },
    { l: "H3",      a: () => ins("\n### Subheading\n")                       },
    null,
    { l: "— list",  a: () => ins("\n- Item one\n- Item two\n- Item three\n") },
    { l: "1. list", a: () => ins("\n1. First\n2. Second\n3. Third\n")        },
    null,
    { l: '" quote', a: () => ins('\n> Blockquote here\n')                    },
    { l: "` code",  a: () => ins("\n`inline code`")                          },
    { l: "link",    a: () => ins("\n[link text](https://)")                  },
    null,
    { l: "— hr",    a: () => ins("\n\n---\n\n")                              },
  ];

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" as const,
      background: "rgba(255,255,255,0.03)",
      border: "0.5px solid rgba(255,255,255,0.08)",
      borderRadius: "7px 7px 0 0", padding: "5px 8px",
    }}>
      {items.map((item, i) =>
        item === null
          ? <span key={i}>{sep}</span>
          : <button key={i} style={tbtn} onMouseEnter={ho} onMouseLeave={uo} onClick={item.a}>{item.l}</button>
      )}
    </div>
  );
}

// ─── Cover image upload zone ───────────────────────────────────────────────────

function CoverUpload({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const readFile = (file: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => onChange(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  };

  const commitUrl = () => {
    const trimmed = urlInput.trim();
    if (trimmed) onChange(trimmed);
  };

  const onPaste = useCallback((e: ClipboardEvent) => {
    // Only handle image paste when user is NOT typing in a text field
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
    const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith("image/"));
    if (item) { e.preventDefault(); readFile(item.getAsFile()!); }
  }, []);

  useEffect(() => {
    window.addEventListener("paste", onPaste as any);
    return () => window.removeEventListener("paste", onPaste as any);
  }, [onPaste]);

  const isDataUrl = value?.startsWith("data:");
  const isUrl     = value && !isDataUrl;

  if (value) {
    return (
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
        {(isDataUrl || isUrl) && (
          <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "0.5px solid rgba(255,255,255,0.12)" }}>
            <img src={value} alt="cover" style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }}
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              background: "rgba(10,13,18,0.82)", backdropFilter: "blur(6px)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "7px 12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#7ab83e", flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>
                  {fileName || value.slice(0, 40) + (value.length > 40 ? "…" : "")}
                </span>
              </div>
              <button onClick={() => { onChange(""); setFileName(null); }}
                style={{ background: "rgba(255,255,255,0.08)", border: "0.5px solid rgba(255,255,255,0.15)", borderRadius: 5, color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "'DM Mono', monospace", padding: "3px 10px", cursor: "pointer", flexShrink: 0 }}
                onMouseEnter={e => { (e.target as any).style.background = "rgba(255,60,60,0.18)"; (e.target as any).style.color = "rgba(255,100,100,0.9)"; }}
                onMouseLeave={e => { (e.target as any).style.background = "rgba(255,255,255,0.08)"; (e.target as any).style.color = "rgba(255,255,255,0.5)"; }}
              >
                remove
              </button>
            </div>
          </div>
        )}
        <input
          type="text"
          value={isDataUrl ? urlInput : value}
          onChange={e => { setUrlInput(e.target.value); if (!isDataUrl) onChange(e.target.value); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (isDataUrl) commitUrl(); } }}
          onBlur={() => { if (isDataUrl) commitUrl(); }}
          placeholder="or paste an image URL to replace…"
          style={inputBase({ fontSize: 11 })} onFocus={focusOn}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          borderRadius: 8, cursor: "pointer", transition: "all 0.18s",
          border: `1.5px dashed ${dragging ? "rgba(99,153,34,0.7)" : "rgba(255,255,255,0.1)"}`,
          background: dragging ? "rgba(99,153,34,0.07)" : "rgba(255,255,255,0.02)",
          padding: "24px 20px",
          display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 10,
        }}
      >
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none" style={{ opacity: dragging ? 0.9 : 0.35, transition: "opacity 0.18s" }}>
          <rect x="4" y="20" width="24" height="8" rx="3" fill="rgba(255,255,255,0.15)" />
          <path d="M16 4 L16 18 M10 10 L16 4 L22 10" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, color: dragging ? "rgba(168,212,111,0.9)" : "rgba(255,255,255,0.55)", fontWeight: 500, transition: "color 0.18s" }}>
            {dragging ? "Drop to set as cover" : "Upload cover image"}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
            drag & drop · click to browse · ctrl+v to paste
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
          {["PNG", "JPG", "WEBP", "GIF"].map(f => (
            <span key={f} style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "2px 7px" }}>{f}</span>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={e => { if (e.target.files?.[0]) readFile(e.target.files[0]); }} />
      </div>
      <input
        type="text"
        value={urlInput}
        onChange={e => setUrlInput(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitUrl(); } }}
        onBlur={commitUrl}
        placeholder="or paste an image URL…"
        style={inputBase({ fontSize: 11 })} onFocus={focusOn}
      />
    </div>
  );
}

// ─── Props & initial state ─────────────────────────────────────────────────────

export interface BlogEditorData {
  title:           string;
  excerpt:         string;
  imageUrl:        string;
  readTime:        string;
  content:         string;
  category:        string;
  status:          string;
  authorName:      string;
  authorBio:       string;
  authorExpertise: string[];
  authorTwitter:   string;
  authorLinkedin:  string;
  authorTelegram:  string;
}

interface Props {
  initialData?: Partial<BlogEditorData>;
  editPost?:    any;
  onSubmit:     (data: BlogEditorData) => Promise<void>;
  onCancel:     () => void;
  saving?:      boolean;
}

const DEFAULTS: BlogEditorData = {
  title:           "",
  excerpt:         "",
  imageUrl:        "",
  readTime:        "",
  content:         "",
  category:        "Analysis",
  status:          "Draft",
  authorName:      "",
  authorBio:       "",
  authorExpertise: [],
  authorTwitter:   "",
  authorLinkedin:  "",
  authorTelegram:  "",
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function BlogPostEditor({ initialData, editPost, onSubmit, onCancel, saving = false }: Props) {
  const [form, setForm]     = useState<BlogEditorData>({ ...DEFAULTS, ...initialData });
  const contentRef          = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setForm({ ...DEFAULTS, ...initialData });
  }, [JSON.stringify(initialData)]);

  const set = (partial: Partial<BlogEditorData>) => setForm(f => ({ ...f, ...partial }));

  const wordCount  = form.content.trim() ? form.content.trim().split(/\s+/).length : 0;
  const activeDest = BLOG_CATEGORIES.find(d => d.value === form.category);

  const mainFocusOn  = (e: any) => { e.target.style.borderColor = "rgba(99,153,34,0.5)";   e.target.style.background = "rgba(255,255,255,0.06)"; };
  const mainFocusOff = (e: any) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.background = "rgba(255,255,255,0.04)"; };

  const mainInput = (extra: any = {}) => ({
    background:   "rgba(255,255,255,0.04)",
    border:       "0.5px solid rgba(255,255,255,0.1)",
    borderRadius: 7,
    color:        "rgba(255,255,255,0.85)",
    fontFamily:   "'Geist', system-ui, sans-serif",
    fontSize:     13,
    padding:      "9px 12px",
    outline:      "none",
    width:        "100%",
    boxSizing:    "border-box" as const,
    ...extra,
  });

  const handleSubmit = async () => {
    if (!form.title.trim() || saving) return;
    await onSubmit({ ...form });
  };

  // Convert bare URLs in pasted text to markdown links
  const handleContentPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const raw = e.clipboardData.getData("text/plain");
    if (!raw) return;

    // Replace standalone URLs (not already in []() markdown) with [Click to read more](url)
    const URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
    const processed = raw.replace(URL_RE, (url, offset, str) => {
      // Check if it's already inside a markdown link: ](url)
      const before = str.slice(Math.max(0, offset - 2), offset);
      if (before.endsWith("](")) return url;
      return `[Click to read more](${url})`;
    });

    // Only intercept if URLs were transformed
    if (processed === raw) return;

    e.preventDefault();
    const ta = contentRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const next  = ta.value.slice(0, start) + processed + ta.value.slice(end);
    set({ content: next });
    // Restore cursor after the inserted text
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + processed.length;
      ta.focus();
    });
  }, []);

  const fileName = editPost ? `edit_post_${editPost.id}.md` : "new_post.md";

  return (
    <div style={{
      background: "#0a0d12", display: "flex", flexDirection: "column" as const,
      flex: 1, minHeight: 0,
      fontFamily: "'Geist', system-ui, sans-serif",
      color: "rgba(255,255,255,0.85)",
      border: "0.5px solid rgba(255,255,255,0.08)",
      borderRadius: 10, overflow: "hidden",
    }}>

      {/* ── Topbar ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", height: 46, background: "#0d1117",
        borderBottom: "0.5px solid rgba(255,255,255,0.07)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TrafficDots />
          <span style={{ marginLeft: 6, fontSize: 12, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.3)", letterSpacing: "0.04em" }}>
            {fileName}
          </span>
        </div>
        <StatusToggle value={form.status} onChange={v => set({ status: v })} />
      </div>

      {/* ── Body ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

        {/* ── Sidebar ── */}
        <div style={{
          width: 240, minWidth: 240, background: "#0d1117",
          borderRight: "0.5px solid rgba(255,255,255,0.07)",
          display: "flex", flexDirection: "column" as const,
          overflowY: "auto" as const, padding: "16px 0 0",
        }}>
          <SidebarLabel style={{ padding: "0 16px 5px" }}>Destination</SidebarLabel>
          {BLOG_CATEGORIES.map(item => (
            <DestItem
              key={item.value}
              item={item}
              active={form.category === item.value}
              onClick={() => set({ category: item.value })}
            />
          ))}

          <div style={{ marginTop: 10 }}>
            <SidebarAuthorPanel form={form} onChange={set} />
          </div>
        </div>

        {/* ── Main content area ── */}
        <div style={{ flex: 1, overflowY: "auto" as const, padding: "28px 32px", display: "flex", flexDirection: "column" as const, gap: 22 }}>

          <SectionHeading>Post Details</SectionHeading>

          {/* Title */}
          <MainField label="Post Title">
            <input
              type="text" value={form.title} onChange={e => set({ title: e.target.value })}
              placeholder="Enter your post title..."
              style={mainInput({ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 18, color: "rgba(255,255,255,0.92)" })}
              onFocus={mainFocusOn} onBlur={mainFocusOff}
            />
          </MainField>

          {/* Read time */}
          <MainField label="Read Time">
            <input type="text" value={form.readTime} onChange={e => set({ readTime: e.target.value })}
              placeholder="e.g. 5 min read" style={mainInput()}
              onFocus={mainFocusOn} onBlur={mainFocusOff} />
          </MainField>

          {/* Excerpt */}
          <MainField label="Excerpt">
            <textarea value={form.excerpt} onChange={e => set({ excerpt: e.target.value })} rows={2}
              placeholder="Short summary shown in article cards and previews..."
              style={mainInput({ resize: "none", lineHeight: 1.65 })}
              onFocus={mainFocusOn} onBlur={mainFocusOff} />
          </MainField>

          {/* Cover image */}
          <MainField label="Cover Image">
            <CoverUpload value={form.imageUrl} onChange={v => set({ imageUrl: v })} />
          </MainField>

          <Divider />

          {/* Content */}
          <SectionHeading>Content</SectionHeading>

          <div style={{ display: "flex", flexDirection: "column" as const }}>
            <Toolbar
              contentRef={contentRef}
              onUpdate={(val) => set({ content: val })}
            />
            <textarea
              ref={contentRef}
              value={form.content}
              onChange={e => set({ content: e.target.value })}
              onPaste={handleContentPaste}
              rows={16}
              placeholder={"Write your article content here...\n\nUse the toolbar above for formatting:\n  **bold** · _italic_ · ## Heading · - list · > quote\n\nPaste any URL and it will become a clickable link automatically.\nStart with a compelling lead paragraph..."}
              style={mainInput({ borderTop: "none", borderRadius: "0 0 7px 7px", resize: "vertical", minHeight: 260, lineHeight: 1.8, fontSize: 13.5 })}
              onFocus={e => { e.target.style.borderColor = "rgba(99,153,34,0.4)"; e.target.style.background = "rgba(255,255,255,0.06)"; }}
              onBlur={mainFocusOff}
            />
          </div>

        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: "14px 28px", borderTop: "0.5px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#0d1117", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
          {[
            { text: `${wordCount} ${wordCount === 1 ? "word" : "words"}`, color: "rgba(255,255,255,0.22)" },
            { text: activeDest?.label.toLowerCase(), color: "rgba(255,255,255,0.22)" },
            form.authorExpertise.length > 0 && {
              text: form.authorExpertise.slice(0, 2).join(", ") + (form.authorExpertise.length > 2 ? ` +${form.authorExpertise.length - 2}` : ""),
              color: "rgba(99,153,34,0.55)",
            },
            { text: form.status.toLowerCase(), color: form.status === "Published" ? "rgba(40,200,64,0.6)" : "rgba(255,189,46,0.6)" },
          ].filter(Boolean).map((item: any, i, arr) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: item.color }}>{item.text}</span>
              {i < arr.length - 1 && <span style={{ color: "rgba(255,255,255,0.1)", fontSize: 11 }}>·</span>}
            </span>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onCancel}
            style={{ background: "none", border: "0.5px solid rgba(255,255,255,0.12)", borderRadius: 7, color: "rgba(255,255,255,0.45)", fontFamily: "'Geist', system-ui, sans-serif", fontSize: 13, padding: "7px 16px", cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => { (e.target as any).style.borderColor = "rgba(255,255,255,0.28)"; (e.target as any).style.color = "rgba(255,255,255,0.75)"; }}
            onMouseLeave={e => { (e.target as any).style.borderColor = "rgba(255,255,255,0.12)"; (e.target as any).style.color = "rgba(255,255,255,0.45)"; }}
          >
            Cancel
          </button>
          <button
            onClick={() => set({ status: "Draft" })}
            style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "rgba(255,255,255,0.45)", fontFamily: "'DM Mono', monospace", fontSize: 12, padding: "7px 14px", cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => { (e.target as any).style.background = "rgba(255,255,255,0.09)"; (e.target as any).style.color = "rgba(255,255,255,0.75)"; }}
            onMouseLeave={e => { (e.target as any).style.background = "rgba(255,255,255,0.05)"; (e.target as any).style.color = "rgba(255,255,255,0.45)"; }}
          >
            Save draft
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.title.trim()}
            style={{ background: saving || !form.title.trim() ? "#2a4d0c" : "#3b6d11", border: "none", borderRadius: 7, color: saving || !form.title.trim() ? "rgba(192,221,151,0.5)" : "#c0dd97", fontFamily: "'Geist', system-ui, sans-serif", fontSize: 13, fontWeight: 500, padding: "7px 22px", cursor: saving || !form.title.trim() ? "not-allowed" : "pointer", transition: "background 0.15s" }}
            onMouseEnter={e => { if (!saving && form.title.trim()) (e.target as any).style.background = "#4a8515"; }}
            onMouseLeave={e => { if (!saving && form.title.trim()) (e.target as any).style.background = "#3b6d11"; }}
          >
            {saving ? "Saving…" : editPost ? "Save Changes →" : "Create Post →"}
          </button>
        </div>
      </div>
    </div>
  );
}
