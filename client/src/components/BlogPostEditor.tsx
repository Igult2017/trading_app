import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { readingTime, wordCount as countWords } from "@shared/readingTime";
import { ChevronLeft } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * TOPICS ARE TYPED, NOT CHOSEN — his instruction, 2026-08-30: *"I need you to make those topics
 * dynamic so that I don't have to choose."*
 *
 * This used to be a fixed list of five. Publishing under a sixth topic meant editing this file, so
 * in practice the blog could only ever have five topics. Now the field is free text and whatever
 * has already been published is offered underneath as one-click suggestions — the list grows by
 * itself as you write.
 *
 * NOTHING DOWNSTREAM BREAKS ON A NEW TOPIC, checked rather than assumed: AdminPanel derives the
 * post's section with `CATEGORY_TO_SECTION[cat] ?? 'blog'`, so an unrecognised topic lands in the
 * blog; and its coloured badge is looked up with a fallback, so a new topic still gets a badge.
 *
 * These five are SEEDS, shown only until real posts exist, so a fresh install is not a blank box.
 */
const SEED_TOPICS = ["Equities", "Forex", "Digital Assets", "Analysis", "Backtested Strategies"];

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
  background:   "var(--admin-thead)",
  border:       "0.5px solid var(--admin-border)",
  borderRadius: 6,
  color:        "var(--admin-text)",
  fontFamily:   "var(--admin-font)",
  fontSize:     12,
  padding:      "7px 10px",
  outline:      "none",
  width:        "100%",
  boxSizing:    "border-box" as const,
  ...extra,
});

const focusOn  = (e: any) => { e.target.style.borderColor = "var(--admin-accent)";   e.target.style.background = "var(--admin-thead)"; };
const focusOff = (e: any) => { e.target.style.borderColor = "var(--admin-border)"; e.target.style.background = "var(--admin-thead)"; };

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function SidebarLabel({ children, style = {} }: { children: React.ReactNode; style?: any }) {
  return (
    <div style={{
      fontSize: 9, fontFamily: "var(--admin-font)", letterSpacing: "0.12em",
      textTransform: "uppercase" as const, color: "var(--admin-muted)",
      padding: "10px 16px 5px", ...style,
    }}>
      {children}
    </div>
  );
}

function SidebarDivider() {
  return <div style={{ height: 0.5, background: "var(--admin-thead)", margin: "8px 0" }} />;
}

function MainLabel({ children }: { children: React.ReactNode }) {
  // Sentence case, not shouted capitals: the design labels fields "Title", "Slug", "Cover image".
  return (
    <label style={{
      fontSize: 13, fontFamily: "var(--admin-font)", fontWeight: 500,
      color: "var(--admin-text)", letterSpacing: "0.01em",
    }}>
      {children}
    </label>
  );
}

/** Two fields side by side, stacking on a narrow screen — Title|Slug, Category|Tags. */
function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="bpe-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      {children}
    </div>
  );
}

/** The switch used by "Allow comments" and "Allow sharing". A real button, so it is reachable by
 *  keyboard and announces its state — the toggles it replaces in the old editor were div's. */
function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
      <span style={{
        position: "relative", width: 38, height: 21, borderRadius: 999, flexShrink: 0,
        background: on ? "var(--admin-accent)" : "var(--admin-border2)", transition: "background 0.18s",
      }}>
        <span style={{
          position: "absolute", top: 3, left: on ? 20 : 3, width: 15, height: 15, borderRadius: "50%",
          background: "#fff", transition: "left 0.18s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        }} />
      </span>
      <span style={{ fontSize: 14, fontFamily: "var(--admin-font)", color: "var(--admin-text)" }}>{label}</span>
    </button>
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
            <polygon fill="var(--admin-card)" points="9.75,15.02 15.5,12 9.75,8.98"/>
          </svg>
        </div>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Paste YouTube URL or video ID…"
          style={{
            flex: 1, background: "var(--admin-thead)", border: "0.5px solid var(--admin-border)",
            borderRadius: 7, color: "var(--admin-text)", fontFamily: "var(--admin-font)",
            fontSize: 13, padding: "9px 12px", outline: "none",
          }}
          onFocus={e => { e.target.style.borderColor = "rgba(255,80,80,0.4)"; e.target.style.background = "var(--admin-thead)"; }}
          onBlur={e => { e.target.style.borderColor = "var(--admin-border)"; e.target.style.background = "var(--admin-thead)"; }}
        />
        {value && (
          <button
            onClick={() => onChange("")}
            style={{ background: "var(--admin-thead)", border: "0.5px solid var(--admin-border)", borderRadius: 7, color: "var(--admin-muted)", fontSize: 12, padding: "0 12px", cursor: "pointer", flexShrink: 0 }}
          >✕</button>
        )}
      </div>

      {/* Live preview */}
      {videoId ? (
        <div style={{ width: "100%", borderRadius: 8, overflow: "hidden", border: "0.5px solid var(--admin-border)" }}>
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            title="YouTube preview"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ display: "block", width: "100%", aspectRatio: "16/9", border: "none" }}
          />
        </div>
      ) : value.trim() ? (
        <div style={{ fontSize: 11, color: "rgba(255,100,100,0.7)", fontFamily: "var(--admin-font)" }}>
          Invalid YouTube URL — try: youtube.com/watch?v=… or youtu.be/…
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "var(--admin-muted)", fontFamily: "var(--admin-font)" }}>
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

// ─── StatusToggle ─────────────────────────────────────────────────────────────

// ─── Sidebar destination item ─────────────────────────────────────────────────

// ─── Sidebar author panel ─────────────────────────────────────────────────────

function ExpertiseInput({ selected, onChange }: { selected: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState("");
  const [customTags, setCustomTags] = useState<string[]>(
    () => selected.filter(t => !EXPERTISE_OPTIONS.includes(t))
  );

  useEffect(() => {
    setCustomTags(prev => {
      const fromSelected = selected.filter(t => !EXPERTISE_OPTIONS.includes(t));
      const merged = Array.from(new Set([...prev, ...fromSelected]));
      return merged;
    });
  }, [selected]);

  const allTags = Array.from(new Set([...EXPERTISE_OPTIONS, ...customTags]));

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
            background: input.trim() ? "var(--admin-accentSoft)" : "var(--admin-thead)",
            border: `0.5px solid ${input.trim() ? "var(--admin-accent)" : "var(--admin-border)"}`,
            borderRadius: 20, color: input.trim() ? "var(--admin-accent)" : "var(--admin-muted)",
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
              background:   on ? "var(--admin-accentSoft)"  : "var(--admin-thead)",
              border:       `0.5px solid ${on ? "var(--admin-accent)" : "var(--admin-border)"}`,
              borderRadius: 20, color: on ? "var(--admin-accent)" : "var(--admin-muted)",
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
        <div style={{ fontSize: 10, fontFamily: "var(--admin-font)", color: "var(--admin-accent)", marginTop: 6 }}>
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
    <div style={{ borderTop: "0.5px solid var(--admin-thead)", paddingTop: 4 }}>
      <SidebarLabel>Author</SidebarLabel>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 16px 10px" }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, var(--admin-accent), var(--admin-accent))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 500, color: "var(--admin-accent)",
        }}>
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "var(--admin-text)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {raw || "Author Name"}
          </div>
          <div style={{ fontSize: 10, color: "var(--admin-muted)", marginTop: 1 }}>Post author</div>
        </div>
      </div>

      <div style={{ padding: "0 16px 8px" }}>
        <div style={{ fontSize: 9, fontFamily: "var(--admin-font)", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--admin-muted)", marginBottom: 4 }}>Name</div>
        <input type="text" value={form.authorName} onChange={e => onChange({ authorName: e.target.value })}
          placeholder="Full name" style={inputBase()} onFocus={focusOn} onBlur={focusOff} />
      </div>

      <div style={{ padding: "0 16px 10px" }}>
        <div style={{ fontSize: 9, fontFamily: "var(--admin-font)", letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--admin-muted)", marginBottom: 4 }}>Short Bio</div>
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

      <SidebarLabel>Social Profiles <span style={{ color: "var(--admin-border)", fontWeight: 400 }}>(optional)</span></SidebarLabel>
      <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column" as const, gap: 7 }}>
        {SOCIAL_PLATFORMS.map(({ key, icon, placeholder }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 6, flexShrink: 0,
              background: "var(--admin-thead)", border: "0.5px solid var(--admin-border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, color: "var(--admin-muted)",
              fontFamily: "var(--admin-font)", fontWeight: 500,
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

  const insertImage = useCallback(() => {
    const ta = contentRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const selected = ta.value.slice(s, e).trim();
    const alt = selected || "image";
    const insert = `![${alt}](https://){Caption here}`;
    const next = ta.value.slice(0, s) + insert + ta.value.slice(e);
    onUpdate(next);
    requestAnimationFrame(() => {
      ta.focus();
      const cursorStart = s + 2;
      const cursorEnd = cursorStart + alt.length;
      ta.selectionStart = cursorStart;
      ta.selectionEnd = cursorEnd;
    });
  }, [contentRef, onUpdate]);

  const tbtn: any = { background: "none", border: "none", color: "var(--admin-muted)", cursor: "pointer", padding: "4px 8px", borderRadius: 4, fontSize: 12, fontFamily: "var(--admin-font)", transition: "all 0.12s", lineHeight: 1 };
  const ho = (e: any) => { e.target.style.background = "var(--admin-thead)"; e.target.style.color = "var(--admin-text)"; };
  const uo = (e: any) => { e.target.style.background = "none"; e.target.style.color = "var(--admin-muted)"; };
  const sep = <div style={{ width: 0.5, height: 16, background: "var(--admin-border)", margin: "0 4px", flexShrink: 0 }} />;

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
    { l: "img",     a: insertImage                                                                     },
    null,
    { l: "— hr",    a: () => insertBlock(() => "\n---\n\n")                                       },
  ];

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" as const,
      background: "var(--admin-thead)",
      border: "0.5px solid var(--admin-border)",
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
  const [zoneFocused, setZoneFocused] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

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

  // Extract any image from a clipboard event; returns true if an image was used
  const extractImage = (clipboardData: DataTransfer | null): boolean => {
    const item = Array.from(clipboardData?.items || []).find(i => i.type.startsWith("image/"));
    if (item) {
      const file = item.getAsFile();
      if (file) { readFile(file); return true; }
    }
    return false;
  };

  // React onPaste — works on the focused dropzone or URL input
  const onLocalPaste = (e: React.ClipboardEvent) => {
    if (extractImage(e.clipboardData)) e.preventDefault();
  };

  const commitUrl = () => {
    const trimmed = urlInput.trim();
    if (trimmed) onChange(trimmed);
  };

  // Global window paste — fallback when focus is elsewhere (title, content, etc)
  // but only when no other text field has focus to avoid hijacking text pastes.
  const onGlobalPaste = useCallback((e: ClipboardEvent) => {
    const target = e.target as HTMLElement;
    const tag = target?.tagName;
    const isEditable = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
    if (isEditable) return;
    if (extractImage(e.clipboardData)) e.preventDefault();
  }, []);

  useEffect(() => {
    window.addEventListener("paste", onGlobalPaste as any);
    return () => window.removeEventListener("paste", onGlobalPaste as any);
  }, [onGlobalPaste]);

  const isDataUrl = value?.startsWith("data:");
  const isUrl     = value && !isDataUrl;

  if (value) {
    return (
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
        {(isDataUrl || isUrl) && (
          <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "0.5px solid var(--admin-border)" }}>
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
                <span style={{ fontSize: 11, fontFamily: "var(--admin-font)", color: "var(--admin-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>
                  {fileName || value.slice(0, 40) + (value.length > 40 ? "…" : "")}
                </span>
              </div>
              <button onClick={() => { onChange(""); setFileName(null); }}
                style={{ background: "var(--admin-border)", border: "0.5px solid var(--admin-border)", borderRadius: 5, color: "var(--admin-muted)", fontSize: 11, fontFamily: "var(--admin-font)", padding: "3px 10px", cursor: "pointer", flexShrink: 0 }}
                onMouseEnter={e => { (e.target as any).style.background = "rgba(255,60,60,0.18)"; (e.target as any).style.color = "rgba(255,100,100,0.9)"; }}
                onMouseLeave={e => { (e.target as any).style.background = "var(--admin-border)"; (e.target as any).style.color = "var(--admin-muted)"; }}
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
          onPaste={onLocalPaste}
          placeholder="or paste an image (or URL) to replace…"
          style={inputBase({ fontSize: 11 })} onFocus={focusOn}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
      <div
        ref={zoneRef}
        tabIndex={0}
        onClick={() => { zoneRef.current?.focus(); fileRef.current?.click(); }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onPaste={onLocalPaste}
        onFocus={() => setZoneFocused(true)}
        onBlur={() => setZoneFocused(false)}
        style={{
          borderRadius: 8, cursor: "pointer", transition: "all 0.18s", outline: "none",
          border: `1.5px dashed ${dragging || zoneFocused ? "rgba(99,153,34,0.7)" : "var(--admin-border)"}`,
          background: dragging || zoneFocused ? "rgba(99,153,34,0.07)" : "var(--admin-thead)",
          padding: "24px 20px",
          display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 10,
        }}
      >
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none" style={{ opacity: dragging ? 0.9 : 0.35, transition: "opacity 0.18s" }}>
          <rect x="4" y="20" width="24" height="8" rx="3" fill="var(--admin-border)" />
          <path d="M16 4 L16 18 M10 10 L16 4 L22 10" stroke="var(--admin-text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, color: dragging ? "rgba(168,212,111,0.9)" : "var(--admin-muted)", fontWeight: 500, transition: "color 0.18s" }}>
            {dragging ? "Drop to set as cover" : zoneFocused ? "Press ⌘/Ctrl+V to paste image" : "Upload cover image"}
          </div>
          <div style={{ fontSize: 11, color: "var(--admin-muted)", marginTop: 4, fontFamily: "var(--admin-font)" }}>
            drag & drop · click to browse · ctrl+v to paste
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
          {["PNG", "JPG", "WEBP", "GIF"].map(f => (
            <span key={f} style={{ fontSize: 10, fontFamily: "var(--admin-font)", color: "var(--admin-muted)", background: "var(--admin-thead)", border: "0.5px solid var(--admin-border)", borderRadius: 4, padding: "2px 7px" }}>{f}</span>
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
        onPaste={onLocalPaste}
        placeholder="or paste an image (or URL)…"
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
  /** When this post should go live, as the browser's local `datetime-local` value. Empty means
   *  publish on save. A time in the future stores the post as Scheduled; the sweep in
   *  server/services/publishScheduler.ts is what actually publishes it. */
  publishAt:       string;
  /** The article's own web address. Left blank, the server makes one from the title. */
  slug:            string;
  /** Whether readers may comment, and whether the share buttons appear. Both are real columns —
   *  see docker-migrate.sql — because a switch that stores nothing is a switch that lies. */
  allowComments:   boolean;
  allowSharing:    boolean;
}

interface Props {
  initialData?:    Partial<BlogEditorData>;
  editPost?:       any;
  onSubmit:        (data: BlogEditorData) => Promise<void>;
  onCancel:        () => void;
  saving?:         boolean;
  onImageUpload?:  (file: File) => Promise<string>;
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
  publishAt:       "",
  slug:            "",
  allowComments:   true,
  allowSharing:    true,
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
    background:   focused ? "var(--admin-thead)" : "var(--admin-thead)",
    border:       `0.5px solid ${focused ? "rgba(99,153,34,0.45)" : "var(--admin-border)"}`,
    borderRadius: "0 0 8px 8px",
    color:        "var(--admin-text)",
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
    background:   "var(--admin-thead)",
    border:       "0.5px solid var(--admin-border)",
    borderRadius: 5,
    color:        "var(--admin-muted)",
    fontFamily:   "var(--admin-font)",
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
        background:     "var(--admin-thead)",
        border:         "0.5px solid var(--admin-border)",
        borderBottom:   "none",
        borderRadius:   "8px 8px 0 0",
      }}>
        <span style={{ fontSize: 10, fontFamily: "var(--admin-font)", color: "var(--admin-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginRight: 4 }}>
          insert
        </span>
        <button style={tbtn} onClick={addBullet}
          onMouseEnter={e => { (e.target as any).style.background = "var(--admin-accentSoft)"; (e.target as any).style.color = "var(--admin-accent)"; (e.target as any).style.borderColor = "var(--admin-accent)"; }}
          onMouseLeave={e => { (e.target as any).style.background = "var(--admin-thead)"; (e.target as any).style.color = "var(--admin-muted)"; (e.target as any).style.borderColor = "var(--admin-border)"; }}>
          • Bullet
        </button>
        <button style={tbtn} onClick={addNumber}
          onMouseEnter={e => { (e.target as any).style.background = "var(--admin-accentSoft)"; (e.target as any).style.color = "var(--admin-accent)"; (e.target as any).style.borderColor = "var(--admin-accent)"; }}
          onMouseLeave={e => { (e.target as any).style.background = "var(--admin-thead)"; (e.target as any).style.color = "var(--admin-muted)"; (e.target as any).style.borderColor = "var(--admin-border)"; }}>
          1. Numbered
        </button>
        <div style={{ flex: 1 }} />
        {bullets.length > 0 && (
          <span style={{ fontSize: 10, fontFamily: "var(--admin-font)", color: "rgba(99,153,34,0.6)" }}>
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
          <div style={{ fontSize: 9, fontFamily: "var(--admin-font)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--admin-accent)", marginBottom: 10 }}>
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
                    fontSize: isNumbered ? 9 : 7, color: "var(--admin-accent)", fontFamily: "var(--admin-font)", fontWeight: 700,
                  }}>
                    {isNumbered ? num : "•"}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--admin-text)", lineHeight: 1.6, fontFamily: "var(--admin-font)" }}>
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

export default function BlogPostEditor({ initialData, editPost, onSubmit, onCancel, saving = false, onImageUpload }: Props) {
  const [form, setForm]     = useState<BlogEditorData>({ ...DEFAULTS, ...initialData });
  const contentRef          = useRef<HTMLTextAreaElement>(null);

  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setForm({ ...DEFAULTS, ...initialData });
  }, [JSON.stringify(initialData)]);

  const set = (partial: Partial<BlogEditorData>) => setForm(f => ({ ...f, ...partial }));

  // COUNTED THE SAME WAY THE READING TIME IS, which it was not before. This split the raw markdown
  // on whitespace, so the markup counted as words — and an embedded cover (the pictures on this blog
  // are base64 data URIs, one of them 430 KB) counted as one enormous "word" while its surrounding
  // syntax added more. The author was shown a figure that did not describe their article.
  const words = countWords(form.content ?? "");


  // THE TOPICS THAT ACTUALLY EXIST, counted from what has been published. Fetched with the same
  // query key the public blog uses, so React Query serves it from cache when both have been open
  // and no extra request goes out. Seeds fill in only while there are no posts at all.
  const { data: publishedPosts = [] } = useQuery<any[]>({
    queryKey: ["/api/blog"],
    queryFn: async () => {
      const r = await fetch("/api/blog");
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const topicCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of publishedPosts) {
      const c = (p?.category ?? "").trim();
      if (c) out[c] = (out[c] ?? 0) + 1;
    }
    return out;
  }, [publishedPosts]);

  const usedTopics = useMemo(
    () => Object.keys(topicCounts).sort((a, b) => topicCounts[b] - topicCounts[a] || a.localeCompare(b)),
    [topicCounts],
  );

  // Suggestions: what has been used, most-published first. Seeds appear only on an empty blog, and
  // whatever is being typed is never suggested back.
  const topicSuggestions = useMemo(() => {
    const base = usedTopics.length > 0 ? usedTopics : SEED_TOPICS;
    const typed = form.category.trim().toLowerCase();
    return base.filter(n => n.toLowerCase() !== typed).slice(0, 8);
  }, [usedTopics, form.category]);

  // What the article ACTUALLY measures. Recomputed as the author writes, so the read-time box shows
  // the real figure instead of inviting a guess. `shared/readingTime.ts` holds the rule, so the
  // editor and the server can never disagree about the number.
  const autoWords    = words;
  const autoReadTime = useMemo(() => readingTime(form.content ?? ""), [form.content]);

  const mainFocusOn  = (e: any) => { e.target.style.borderColor = "var(--admin-accent)"; e.target.style.boxShadow = "0 0 0 3px var(--admin-accentSoft)"; };
  const mainFocusOff = (e: any) => { e.target.style.borderColor = "var(--admin-border2)"; e.target.style.boxShadow = "none"; };

  const mainInput = (extra: any = {}) => ({
    background:   "var(--admin-card)",
    border:       "1px solid var(--admin-border2)",
    borderRadius: 8,
    color:        "var(--admin-text)",
    fontFamily:   "var(--admin-font)",
    fontSize:     14,
    padding:      "11px 14px",
    outline:      "none",
    width:        "100%",
    boxSizing:    "border-box" as const,
    transition:   "border-color 0.14s, box-shadow 0.14s",
    ...extra,
  });

  const handleSubmit = async (status?: string) => {
    if (!form.title.trim() || saving) return;
    // A future publish time wins over the button: "Save & publish" with a date set means schedule,
    // which is what the date field is for. The server decides the final state, this just says what
    // was intended.
    await onSubmit({ ...form, ...(status ? { status } : {}) });
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
    const imageItem = Array.from(e.clipboardData.items || []).find(item => item.type.startsWith("image/"));

    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        e.preventDefault();
        const ta = contentRef.current;
        if (!ta) return;
        const insertPos = ta.selectionStart;

        if (onImageUpload) {
          // Insert a placeholder, upload, then swap in the real URL
          const placeholder = `![Uploading image…]()`;
          const withPlaceholder = ta.value.slice(0, insertPos) + placeholder + '\n' + ta.value.slice(insertPos);
          set({ content: withPlaceholder });
          onImageUpload(file).then(url => {
            setForm(f => ({
              ...f,
              content: f.content.replace(placeholder, `![image](${url})`),
            }));
          }).catch(() => {
            setForm(f => ({ ...f, content: f.content.replace(placeholder + '\n', '') }));
          });
        } else {
          // Fallback: embed as base64 (works but large)
          const reader = new FileReader();
          reader.onload = () => {
            const next = ta.value.slice(0, insertPos) + `![image](${reader.result as string})\n` + ta.value.slice(insertPos);
            set({ content: next });
          };
          reader.readAsDataURL(file);
        }
        return;
      }
    }

    let processed: string | null = null;

    if (html && html.trim()) {
      // Rich content from Word, Google Docs, web pages — convert HTML to markdown
      processed = htmlToMarkdown(html);

      // Upload any blob: URLs from pasted HTML (they expire when the tab closes)
      if (onImageUpload && processed.includes('blob:')) {
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
        const blobRe = /!\[([^\]]*)\]\((blob:[^)]+)\)/g;
        for (const match of Array.from(processed.matchAll(blobRe))) {
          const [full, alt, blobUrl] = match;
          (async () => {
            try {
              const resp = await fetch(blobUrl);
              const blob = await resp.blob();
              const file = new File([blob], 'pasted-image', { type: blob.type || 'image/png' });
              const uploadedUrl = await onImageUpload(file);
              setForm(f => ({ ...f, content: f.content.replace(full, `![${alt}](${uploadedUrl})`) }));
            } catch { /* leave blob URL if fetch/upload fails */ }
          })();
        }
        return;
      }
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
  }, [htmlToMarkdown, contentRef, onImageUpload, setForm]);

  const fileName = editPost ? `edit_post_${editPost.id}.md` : "new_post.md";

  const btnBase = {
    fontFamily: "var(--admin-font)", fontSize: 14, fontWeight: 600, cursor: "pointer",
    borderRadius: 8, padding: "11px 20px", border: "none", transition: "opacity 0.14s",
  } as const;

  return (
    <div className="bpe-root" style={{
      maxWidth: 860, margin: "0 auto", width: "100%",
      fontFamily: "var(--admin-font)", color: "var(--admin-text)",
      display: "flex", flexDirection: "column" as const, gap: 20,
    }}>
      <style>{`
        @media (max-width: 760px) {
          .bpe-row { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Back to the list */}
      <button type="button" onClick={onCancel}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start",
                 background: "none", border: "none", padding: 0, cursor: "pointer",
                 color: "var(--admin-muted)", fontFamily: "var(--admin-font)", fontSize: 14 }}>
        <ChevronLeft size={16} /> Blog
      </button>

      <h1 style={{
        margin: 0, fontFamily: "var(--admin-header-font)", fontSize: 28, fontWeight: 600,
        letterSpacing: "-0.01em", color: "var(--admin-text)",
      }}>{editPost ? "Edit article" : "New article"}</h1>

      <FieldRow>
        <MainField label="Title">
          <input value={form.title} onChange={e => set({ title: e.target.value })}
            placeholder="The headline readers see" style={mainInput()}
            onFocus={mainFocusOn} onBlur={mainFocusOff} />
        </MainField>
        <MainField label="Slug">
          <input value={form.slug} onChange={e => set({ slug: e.target.value })}
            placeholder="left blank, it is made from the title" style={mainInput()}
            onFocus={mainFocusOn} onBlur={mainFocusOff} />
        </MainField>
      </FieldRow>

      <MainField label="Cover image">
        <CoverUpload value={form.imageUrl} onChange={v => set({ imageUrl: v })} />
      </MainField>

      <MainField label="Author name">
        <input value={form.authorName} onChange={e => set({ authorName: e.target.value })}
          placeholder="e.g. Jane Doe — leave blank to use your account name" style={mainInput()}
          onFocus={mainFocusOn} onBlur={mainFocusOff} />
      </MainField>

      <FieldRow>
        <MainField label="Category">
          <input value={form.category} onChange={e => set({ category: e.target.value })}
            placeholder="Analysis, Forex, Equities…" style={mainInput()}
            onFocus={mainFocusOn} onBlur={mainFocusOff} />
          {topicSuggestions.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginTop: 8 }}>
              {topicSuggestions.slice(0, 5).map(name => (
                <button key={name} type="button" onClick={() => set({ category: name })}
                  style={{ background: "var(--admin-thead)", border: "1px solid var(--admin-border)",
                           borderRadius: 999, padding: "4px 11px", fontSize: 12, cursor: "pointer",
                           color: "var(--admin-muted)", fontFamily: "var(--admin-font)" }}>
                  {name}
                </button>
              ))}
            </div>
          )}
        </MainField>
        <MainField label="Read time">
          <input value={form.readTime} onChange={e => set({ readTime: e.target.value })}
            placeholder={autoReadTime ? `${autoReadTime} — from the article` : "e.g. 5 min"}
            style={mainInput()} onFocus={mainFocusOn} onBlur={mainFocusOff} />
          {autoReadTime && form.readTime.trim() && form.readTime.trim() !== autoReadTime && (
            <div style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 6 }}>
              the article measures {autoReadTime} ({autoWords} words) —{" "}
              <button type="button" onClick={() => set({ readTime: "" })}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                         color: "var(--admin-accent)", font: "inherit", textDecoration: "underline" }}>
                use that
              </button>
            </div>
          )}
        </MainField>
      </FieldRow>

      <MainField label="Excerpt">
        <textarea value={form.excerpt} onChange={e => set({ excerpt: e.target.value })} rows={2}
          placeholder="One or two lines shown under the headline"
          style={mainInput({ resize: "vertical", lineHeight: 1.6 })}
          onFocus={mainFocusOn} onBlur={mainFocusOff} />
      </MainField>

      <MainField label="Article summary">
        <SummaryEditor value={form.summary} onChange={v => set({ summary: v })} />
      </MainField>

      <MainField label="Content">
        <div style={{ display: "flex", flexDirection: "column" as const }}>
          <Toolbar contentRef={contentRef} onUpdate={(val) => set({ content: val })} />
          <textarea
            ref={contentRef}
            value={form.content}
            onChange={e => set({ content: e.target.value })}
            onPaste={handleContentPaste}
            rows={18}
            placeholder={"Write your article here.\n\n**bold** · _italic_ · ## Heading · - list · > quote"}
            style={mainInput({ borderTop: "none", borderRadius: "0 0 8px 8px", resize: "vertical", minHeight: 320, lineHeight: 1.8 })}
            onFocus={mainFocusOn}
            onBlur={mainFocusOff}
          />
        </div>
      </MainField>

      <MainField label="Video (optional)">
        <YoutubeEmbed value={form.videoUrl} onChange={v => set({ videoUrl: v })} />
      </MainField>

      <SidebarAuthorPanel form={form} onChange={set} />

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" as const, alignItems: "center" }}>
        <Switch on={form.allowComments} label="Allow comments" onChange={v => set({ allowComments: v })} />
        <Switch on={form.allowSharing} label="Allow sharing" onChange={v => set({ allowSharing: v })} />
      </div>

      <div>
        <div style={{ fontSize: 13, fontFamily: "var(--admin-font)", marginBottom: 8 }}>
          <span style={{ color: "var(--admin-text)", fontWeight: 500 }}>Publish later</span>
          <span style={{ color: "var(--admin-muted)" }}> — leave empty to publish straight away</span>
        </div>
        <input type="datetime-local" value={form.publishAt}
          onChange={e => set({ publishAt: e.target.value })}
          style={mainInput({ maxWidth: 285 })}
          onFocus={mainFocusOn} onBlur={mainFocusOff} />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, paddingBottom: 8 }}>
        <button onClick={() => handleSubmit("Draft")} disabled={saving || !form.title.trim()}
          style={{ ...btnBase, background: "var(--admin-rail)", color: "#fff",
                   opacity: saving || !form.title.trim() ? 0.5 : 1,
                   cursor: saving || !form.title.trim() ? "not-allowed" : "pointer" }}>
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button onClick={() => handleSubmit(form.publishAt ? "Scheduled" : "Published")}
          disabled={saving || !form.title.trim()}
          style={{ ...btnBase, background: "var(--admin-accent)", color: "#fff",
                   opacity: saving || !form.title.trim() ? 0.5 : 1,
                   cursor: saving || !form.title.trim() ? "not-allowed" : "pointer" }}>
          {saving ? "Saving…" : form.publishAt ? "Save & schedule" : "Save & publish"}
        </button>
        <button onClick={onCancel}
          style={{ ...btnBase, background: "transparent", color: "var(--admin-muted)",
                   border: "1px solid var(--admin-border2)" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
