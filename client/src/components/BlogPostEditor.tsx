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
  fontFamily:   "var(--admin-font)",
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

function extractYoutubeId(url: string): string | null {
  if (!url.trim()) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function YoutubeEmbed({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const videoId = extractYoutubeId(value);
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {/* YouTube icon */}
        <div style={{
          width: 34, height: 34, borderRadius: 7, flexShrink: 0,
          background: "rgba(255,0,0,0.12)", border: "0.5px solid rgba(255,0,0,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,80,80,0.9)">
            <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8z"/>
            <polygon fill="#0d1117" points="9.75,15.02 15.5,12 9.75,8.98"/>
          </svg>
        </div>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Paste YouTube URL or video ID…"
          style={{
            flex: 1, background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.1)",
            borderRadius: 7, color: "rgba(255,255,255,0.85)", fontFamily: "var(--admin-font)",
            fontSize: 13, padding: "9px 12px", outline: "none",
          }}
          onFocus={e => { e.target.style.borderColor = "rgba(255,80,80,0.4)"; e.target.style.background = "rgba(255,255,255,0.06)"; }}
          onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.background = "rgba(255,255,255,0.04)"; }}
        />
        {value && (
          <button
            onClick={() => onChange("")}
            style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "rgba(255,255,255,0.4)", fontSize: 12, padding: "0 12px", cursor: "pointer", flexShrink: 0 }}
          >✕</button>
        )}
      </div>

      {/* Live preview */}
      {videoId ? (
        <div style={{ width: "100%", borderRadius: 8, overflow: "hidden", border: "0.5px solid rgba(255,255,255,0.1)" }}>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            title="YouTube preview"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ display: "block", width: "100%", aspectRatio: "16/9", border: "none" }}
          />
        </div>
      ) : value.trim() ? (
        <div style={{ fontSize: 11, color: "rgba(255,100,100,0.7)", fontFamily: "'DM Mono',monospace" }}>
          Invalid YouTube URL — try: youtube.com/watch?v=… or youtu.be/…
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'DM Mono',monospace" }}>
          Leave blank if the post has no video version.
        </div>
      )}
    </div>
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

function ExpertiseInput({ selected, onChange }: { selected: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState("");
  const [customTags, setCustomTags] = useState<string[]>(
    () => selected.filter(t => !EXPERTISE_OPTIONS.includes(t))
  );

  useEffect(() => {
    setCustomTags(prev => {
      const fromSelected = selected.filter(t => !EXPERTISE_OPTIONS.includes(t));
      const merged = [...new Set([...prev, ...fromSelected])];
      return merged;
    });
  }, [selected]);

  const allTags = [...new Set([...EXPERTISE_OPTIONS, ...customTags])];

  const add = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (!customTags.includes(trimmed) && !EXPERTISE_OPTIONS.includes(trimmed)) {
      setCustomTags(prev => [...prev, trimmed]);
    }
    if (!selected.includes(trimmed)) {
      onChange([...selected, trimmed]);
    }
    setInput("");
  };

  const remove = (tag: string) => onChange(selected.filter(t => t !== tag));

  const removeCustom = (tag: string) => {
    setCustomTags(prev => prev.filter(t => t !== tag));
    if (selected.includes(tag)) onChange(selected.filter(t => t !== tag));
  };

  const toggle = (tag: string) =>
    selected.includes(tag) ? remove(tag) : onChange([...selected, tag]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(input); }
    if (e.key === "Backspace" && !input && selected.length) remove(selected[selected.length - 1]);
  };

  return (
    <div style={{ padding: "0 16px 10px" }}>
      {/* custom input */}
      <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Add custom tag…"
          style={inputBase({ fontSize: 11, borderRadius: 20, padding: "4px 10px" })}
          onFocus={focusOn}
          onBlur={focusOff}
        />
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); add(input); }}
          disabled={!input.trim()}
          style={{
            background: input.trim() ? "rgba(99,153,34,0.25)" : "rgba(255,255,255,0.05)",
            border: `0.5px solid ${input.trim() ? "rgba(99,153,34,0.5)" : "rgba(255,255,255,0.1)"}`,
            borderRadius: 20, color: input.trim() ? "#a8d46f" : "rgba(255,255,255,0.25)",
            fontSize: 13, cursor: input.trim() ? "pointer" : "not-allowed",
            padding: "2px 10px", flexShrink: 0, lineHeight: 1,
            transition: "all 0.15s",
          }}
        >+</button>
      </div>

      {/* chips */}
      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 5 }}>
        {allTags.map(tag => {
          const on = selected.includes(tag);
          const isCustom = !EXPERTISE_OPTIONS.includes(tag);
          return (
            <button key={tag} type="button" onClick={() => toggle(tag)} style={{
              background:   on ? "rgba(99,153,34,0.2)"  : "rgba(255,255,255,0.04)",
              border:       `0.5px solid ${on ? "rgba(99,153,34,0.55)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: 20, color: on ? "#a8d46f" : "rgba(255,255,255,0.38)",
              fontSize: 10, fontFamily: "var(--admin-font)",
              padding: "4px 10px", cursor: "pointer", transition: "all 0.15s",
              whiteSpace: "nowrap" as const, lineHeight: 1.4, display: "flex", alignItems: "center", gap: 4,
            }}>
              {on && <span style={{ fontSize: 9 }}>✓</span>}
              {tag}
              {isCustom && (
                <span
                  onClick={e => { e.stopPropagation(); removeCustom(tag); }}
                  style={{ marginLeft: 2, fontSize: 10, opacity: 0.6, cursor: "pointer" }}
                  title="Delete custom tag"
                >×</span>
              )}
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "rgba(99,153,34,0.55)", marginTop: 6 }}>
          {selected.length} selected
        </div>
      )}
    </div>
  );
}

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
      <ExpertiseInput
        selected={form.authorExpertise}
        onChange={tags => onChange({ authorExpertise: tags })}
      />

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
  // Wrap selection (or a placeholder) with `before`/`after` markers — for inline formatting like **bold**, _italic_
  const wrapInline = useCallback((before: string, after: string, placeholder: string) => {
    const ta = contentRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const selected = ta.value.slice(s, e);
    const inner = selected || placeholder;
    const insert = before + inner + after;
    const next = ta.value.slice(0, s) + insert + ta.value.slice(e);
    onUpdate(next);
    requestAnimationFrame(() => {
      ta.focus();
      const cursorStart = s + before.length;
      const cursorEnd   = cursorStart + inner.length;
      ta.selectionStart = cursorStart;
      ta.selectionEnd   = cursorEnd;
    });
  }, [contentRef, onUpdate]);

  // Insert/transform a block-level chunk — for headings, lists, quotes, hr
  // Ensures the chunk starts on its own line (adds a leading \n only if needed)
  const insertBlock = useCallback((build: (selected: string) => string) => {
    const ta = contentRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const selected = ta.value.slice(s, e);
    const block = build(selected);
    const before = ta.value.slice(0, s);
    const needLeadingNl = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const insert = needLeadingNl + block;
    const next = before + insert + ta.value.slice(e);
    onUpdate(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = s + insert.length;
      ta.selectionStart = ta.selectionEnd = pos;
    });
  }, [contentRef, onUpdate]);

  const tbtn: any = { background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: "4px 8px", borderRadius: 4, fontSize: 12, fontFamily: "'DM Mono', monospace", transition: "all 0.12s", lineHeight: 1 };
  const ho = (e: any) => { e.target.style.background = "rgba(255,255,255,0.07)"; e.target.style.color = "rgba(255,255,255,0.85)"; };
  const uo = (e: any) => { e.target.style.background = "none"; e.target.style.color = "rgba(255,255,255,0.4)"; };
  const sep = <div style={{ width: 0.5, height: 16, background: "rgba(255,255,255,0.1)", margin: "0 4px", flexShrink: 0 }} />;

  const items: any[] = [
    { l: <b>B</b>,  a: () => wrapInline("**", "**", "bold text")                                  },
    { l: <i>I</i>,  a: () => wrapInline("_", "_", "italic text")                                  },
    { l: "S̶",       a: () => wrapInline("~~", "~~", "strikethrough")                              },
    null,
    { l: "H2",      a: () => insertBlock(sel => `## ${sel || "Heading"}\n`)                       },
    { l: "H3",      a: () => insertBlock(sel => `### ${sel || "Subheading"}\n`)                   },
    null,
    { l: "— list",  a: () => insertBlock(sel => sel
        ? sel.split('\n').map(l => l.trim() ? `- ${l}` : l).join('\n') + '\n'
        : "- Item one\n- Item two\n- Item three\n")                                                },
    { l: "1. list", a: () => insertBlock(sel => sel
        ? sel.split('\n').map((l, i) => l.trim() ? `${i + 1}. ${l}` : l).join('\n') + '\n'
        : "1. First\n2. Second\n3. Third\n")                                                       },
    null,
    { l: '" quote', a: () => insertBlock(sel => sel
        ? sel.split('\n').map(l => `> ${l}`).join('\n') + '\n'
        : "> Blockquote here\n")                                                                   },
    { l: "` code",  a: () => wrapInline("`", "`", "inline code")                                  },
    { l: "link",    a: () => {
        const ta = contentRef.current; if (!ta) return;
        const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        wrapInline("[", "](https://)", sel || "link text");
      }                                                                                            },
    null,
    { l: "— hr",    a: () => insertBlock(() => "\n---\n\n")                                       },
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
  summary:         string;
  imageUrl:        string;
  videoUrl:        string;
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
  summary:         "",
  imageUrl:        "",
  videoUrl:        "",
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

// ─── Smart bullet-point summary editor ────────────────────────────────────────

function SummaryEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  const lines   = value ? value.split("\n") : [];
  const bullets = lines.filter(l => l.trim().length > 0);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    if (e.key === "Enter") {
      const lineStart  = ta.value.lastIndexOf("\n", ta.selectionStart - 1) + 1;
      const lineEnd    = ta.value.indexOf("\n", ta.selectionStart);
      const currentLine = ta.value.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      const bulletMatch = currentLine.match(/^(•|-|\d+\.) /);
      if (bulletMatch) {
        e.preventDefault();
        // If current bullet line is empty (just the marker), remove it and stop
        if (currentLine.trim() === bulletMatch[0].trim()) {
          const newVal = ta.value.slice(0, lineStart) + ta.value.slice(ta.selectionStart);
          onChange(newVal);
          requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = lineStart; });
          return;
        }
        // Insert a new bullet on the next line
        const prefix = bulletMatch[0];
        const insert  = "\n" + prefix;
        const newVal  = ta.value.slice(0, ta.selectionStart) + insert + ta.value.slice(ta.selectionEnd);
        onChange(newVal);
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = ta.selectionStart + insert.length; });
      }
    }
    if (e.key === "Backspace") {
      const lineStart = ta.value.lastIndexOf("\n", ta.selectionStart - 1) + 1;
      const currentLine = ta.value.slice(lineStart, ta.selectionStart);
      // If cursor is right after a bullet marker on an otherwise empty line, remove the bullet
      if (/^(•|-|\d+\.) $/.test(currentLine)) {
        e.preventDefault();
        const newVal = ta.value.slice(0, lineStart) + ta.value.slice(ta.selectionStart);
        onChange(newVal);
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = lineStart; });
      }
    }
  };

  const insertAt = (prefix: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const pos    = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const after  = ta.value.slice(pos);
    const needsNewline = before.length > 0 && !before.endsWith("\n");
    const insert = (needsNewline ? "\n" : "") + prefix;
    const newVal = before + insert + after;
    onChange(newVal);
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = pos + insert.length;
      ta.focus();
    });
  };

  const addBullet  = () => insertAt("• ");
  const addNumber  = () => {
    const count = (value.match(/^\d+\. /gm) || []).length + 1;
    insertAt(`${count}. `);
  };

  const base: React.CSSProperties = {
    background:   focused ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.03)",
    border:       `0.5px solid ${focused ? "rgba(99,153,34,0.45)" : "rgba(255,255,255,0.1)"}`,
    borderRadius: "0 0 8px 8px",
    color:        "rgba(255,255,255,0.82)",
    fontFamily:   "var(--admin-font)",
    fontSize:     13.5,
    lineHeight:   1.9,
    padding:      "12px 14px",
    outline:      "none",
    width:        "100%",
    boxSizing:    "border-box" as const,
    resize:       "vertical" as const,
    minHeight:    140,
    transition:   "border-color 0.15s, background 0.15s",
  };

  const tbtn: React.CSSProperties = {
    background:   "rgba(255,255,255,0.05)",
    border:       "0.5px solid rgba(255,255,255,0.12)",
    borderRadius: 5,
    color:        "rgba(255,255,255,0.55)",
    fontFamily:   "'DM Mono', monospace",
    fontSize:     11,
    padding:      "4px 11px",
    cursor:       "pointer",
    transition:   "all 0.12s",
    lineHeight:   1.4,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        gap:            6,
        padding:        "7px 12px",
        background:     "rgba(255,255,255,0.025)",
        border:         "0.5px solid rgba(255,255,255,0.1)",
        borderBottom:   "none",
        borderRadius:   "8px 8px 0 0",
      }}>
        <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em", textTransform: "uppercase", marginRight: 4 }}>
          insert
        </span>
        <button style={tbtn} onClick={addBullet}
          onMouseEnter={e => { (e.target as any).style.background = "rgba(99,153,34,0.15)"; (e.target as any).style.color = "#a8d46f"; (e.target as any).style.borderColor = "rgba(99,153,34,0.4)"; }}
          onMouseLeave={e => { (e.target as any).style.background = "rgba(255,255,255,0.05)"; (e.target as any).style.color = "rgba(255,255,255,0.55)"; (e.target as any).style.borderColor = "rgba(255,255,255,0.12)"; }}>
          • Bullet
        </button>
        <button style={tbtn} onClick={addNumber}
          onMouseEnter={e => { (e.target as any).style.background = "rgba(99,153,34,0.15)"; (e.target as any).style.color = "#a8d46f"; (e.target as any).style.borderColor = "rgba(99,153,34,0.4)"; }}
          onMouseLeave={e => { (e.target as any).style.background = "rgba(255,255,255,0.05)"; (e.target as any).style.color = "rgba(255,255,255,0.55)"; (e.target as any).style.borderColor = "rgba(255,255,255,0.12)"; }}>
          1. Numbered
        </button>
        <div style={{ flex: 1 }} />
        {bullets.length > 0 && (
          <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "rgba(99,153,34,0.6)" }}>
            {bullets.length} {bullets.length === 1 ? "point" : "points"}
          </span>
        )}
        {value.trim() && (
          <button style={{ ...tbtn, color: "rgba(255,80,80,0.5)", borderColor: "rgba(255,80,80,0.15)" }}
            onClick={() => onChange("")}
            onMouseEnter={e => { (e.target as any).style.color = "rgba(255,80,80,0.85)"; (e.target as any).style.borderColor = "rgba(255,80,80,0.4)"; }}
            onMouseLeave={e => { (e.target as any).style.color = "rgba(255,80,80,0.5)"; (e.target as any).style.borderColor = "rgba(255,80,80,0.15)"; }}>
            clear
          </button>
        )}
      </div>

      {/* Editable textarea */}
      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={6}
        placeholder={"• The key insight readers should walk away with\n• What changed in the market this week\n• Why this matters for your trading strategy\n\nPress Enter after each bullet to auto-continue. Use the toolbar to insert bullets or numbers."}
        style={base}
      />

      {/* Live preview */}
      {bullets.length > 0 && (
        <div style={{
          marginTop:    10,
          padding:      "12px 16px",
          background:   "rgba(99,153,34,0.04)",
          border:       "0.5px solid rgba(99,153,34,0.18)",
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(99,153,34,0.5)", marginBottom: 10 }}>
            Reader preview
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {bullets.map((line, i) => {
              const text = line.replace(/^(•|-|\d+\.) /, "").trim();
              const isNumbered = /^\d+\. /.test(line);
              const num = isNumbered ? line.match(/^(\d+)/)?.[1] : null;
              if (!text) return null;
              return (
                <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <span style={{
                    flexShrink: 0, marginTop: 1,
                    width: 20, height: 20, borderRadius: isNumbered ? 4 : "50%",
                    background: "rgba(99,153,34,0.18)", border: "0.5px solid rgba(99,153,34,0.35)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: isNumbered ? 9 : 7, color: "#a8d46f", fontFamily: "'DM Mono', monospace", fontWeight: 700,
                  }}>
                    {isNumbered ? num : "•"}
                  </span>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", lineHeight: 1.6, fontFamily: "var(--admin-font)" }}>
                    {text}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

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
    fontFamily:   "var(--admin-font)",
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

  // Convert HTML clipboard (from Word, Google Docs, web pages) to Markdown so
  // bolds, italics, headings, lists, links, blockquotes survive the paste.
  const htmlToMarkdown = useCallback((html: string): string => {
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Remove style/script and Microsoft Office VML/conditional junk
    doc.querySelectorAll("style, script, meta, link, [aria-hidden='true']").forEach(n => n.remove());

    const walk = (node: Node, listCtx: { type: 'ul' | 'ol' | null; index: number } = { type: null, index: 0 }): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        // Collapse whitespace inside text nodes (HTML semantics)
        return (node.textContent || '').replace(/\s+/g, ' ');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const childMd = (ctx?: { type: 'ul' | 'ol' | null; index: number }) =>
        Array.from(el.childNodes).map(c => walk(c, ctx ?? listCtx)).join('');

      switch (tag) {
        case 'br': return '\n';
        case 'p':  return childMd().trim() ? `${childMd().trim()}\n\n` : '';
        case 'h1': return `\n# ${childMd().trim()}\n\n`;
        case 'h2': return `\n## ${childMd().trim()}\n\n`;
        case 'h3': return `\n### ${childMd().trim()}\n\n`;
        case 'h4': case 'h5': case 'h6': return `\n#### ${childMd().trim()}\n\n`;
        case 'strong': case 'b': {
          const t = childMd().trim();
          return t ? `**${t}**` : '';
        }
        case 'em': case 'i': {
          const t = childMd().trim();
          return t ? `_${t}_` : '';
        }
        case 'u': return childMd();
        case 's': case 'del': case 'strike': {
          const t = childMd().trim();
          return t ? `~~${t}~~` : '';
        }
        case 'code': {
          const t = (el.textContent || '').trim();
          return t ? `\`${t}\`` : '';
        }
        case 'pre': {
          const t = (el.textContent || '').replace(/\n+$/, '');
          return t ? `\n\`\`\`\n${t}\n\`\`\`\n\n` : '';
        }
        case 'blockquote': {
          const inner = childMd().trim();
          if (!inner) return '';
          return '\n' + inner.split('\n').map(l => `> ${l}`).join('\n') + '\n\n';
        }
        case 'a': {
          const href = el.getAttribute('href') || '';
          const text = childMd().trim() || href;
          return href ? `[${text}](${href})` : text;
        }
        case 'img': {
          const src = el.getAttribute('src') || '';
          const alt = el.getAttribute('alt') || '';
          return src ? `![${alt}](${src})` : '';
        }
        case 'hr': return '\n\n---\n\n';
        case 'ul':
        case 'ol': {
          const items = Array.from(el.children).filter(c => c.tagName.toLowerCase() === 'li');
          const lines = items.map((li, i) => {
            const inner = Array.from(li.childNodes).map(c => walk(c, { type: tag as 'ul' | 'ol', index: i })).join('').trim();
            const marker = tag === 'ul' ? '-' : `${i + 1}.`;
            return `${marker} ${inner}`;
          });
          return '\n' + lines.join('\n') + '\n\n';
        }
        case 'li': return childMd().trim();
        case 'div':
        case 'span':
        case 'section':
        case 'article':
        case 'main':
        case 'header':
        case 'footer':
        default: {
          // Generic block-ish element — preserve its children
          return childMd();
        }
      }
    };

    let md = walk(doc.body);
    // Normalize: at most 2 consecutive blank lines, trim, decode &nbsp;
    md = md
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Linkify any bare URLs that weren't already in [text](url) form
    const URL_RE = /(?<![(\]])https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
    md = md.replace(URL_RE, url => `[${url}](${url})`);

    return md;
  }, []);

  const handleContentPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html  = e.clipboardData.getData("text/html");
    const plain = e.clipboardData.getData("text/plain");

    let processed: string | null = null;

    if (html && html.trim()) {
      // Rich content from Word, Google Docs, web pages — convert HTML to markdown
      processed = htmlToMarkdown(html);
    } else if (plain) {
      // Plain text — only intervene if there are bare URLs to linkify
      const URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
      const linkified = plain.replace(URL_RE, (url, offset, str) => {
        const before = str.slice(Math.max(0, offset - 2), offset);
        if (before.endsWith("](")) return url;
        return `[Click to read more](${url})`;
      });
      if (linkified !== plain) processed = linkified;
    }

    if (processed === null) return;

    e.preventDefault();
    const ta = contentRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const next  = ta.value.slice(0, start) + processed + ta.value.slice(end);
    set({ content: next });
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + processed!.length;
      ta.focus();
    });
  }, [htmlToMarkdown]);

  const fileName = editPost ? `edit_post_${editPost.id}.md` : "new_post.md";

  return (
    <div style={{
      background: "#0a0d12", display: "flex", flexDirection: "column" as const,
      flex: 1, minHeight: 0,
      fontFamily: "var(--admin-font)",
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
              style={mainInput({ fontSize: 18, color: "rgba(255,255,255,0.92)" })}
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

          <Divider />

          {/* Article Summary */}
          <SectionHeading>Article Summary</SectionHeading>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontFamily: "var(--admin-font)", marginTop: -14, marginBottom: 2, lineHeight: 1.6 }}>
            Key takeaways shown before the full article — great for readers who skim. Each bullet or numbered point becomes a formatted list.
          </div>
          <SummaryEditor value={form.summary} onChange={v => set({ summary: v })} />

          <Divider />

          {/* Cover image */}
          <MainField label="Cover Image">
            <CoverUpload value={form.imageUrl} onChange={v => set({ imageUrl: v })} />
          </MainField>

          <Divider />

          {/* YouTube embed */}
          <MainField label="YouTube Video (optional)">
            <YoutubeEmbed value={form.videoUrl} onChange={v => set({ videoUrl: v })} />
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
            style={{ background: "none", border: "0.5px solid rgba(255,255,255,0.12)", borderRadius: 7, color: "rgba(255,255,255,0.45)", fontFamily: "var(--admin-font)", fontSize: 13, padding: "7px 16px", cursor: "pointer", transition: "all 0.15s" }}
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
            style={{ background: saving || !form.title.trim() ? "#2a4d0c" : "#3b6d11", border: "none", borderRadius: 7, color: saving || !form.title.trim() ? "rgba(192,221,151,0.5)" : "#c0dd97", fontFamily: "var(--admin-font)", fontSize: 13, fontWeight: 500, padding: "7px 22px", cursor: saving || !form.title.trim() ? "not-allowed" : "pointer", transition: "background 0.15s" }}
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
