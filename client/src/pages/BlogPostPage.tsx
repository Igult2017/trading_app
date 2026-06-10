import { useState, useEffect, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { ArrowLeft, Clock, Calendar, Image as ImageIcon, MessageCircle, Send } from 'lucide-react';
import { usePublicTheme } from '@/context/PublicThemeContext';
import { usePageTracking } from '@/hooks/usePageTracking';
import SEOHead from '@/components/SEOHead';

// ── Types ─────────────────────────────────────────────────────────────────────

function extractYoutubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
  return null;
}

type Post = {
  id: string | number;
  title: string;
  excerpt: string;
  content: string;
  videoUrl: string;
  category: string;
  author: string;
  date: string;
  readTime: string;
  imageUrl: string;
  status: string;
  authorData?: {
    bio?: string;
    expertise?: string[];
    twitter?: string;
    linkedin?: string;
    telegram?: string;
  } | null;
};

type Comment = {
  id: string;
  name: string;
  message: string;
  reply?: string | null;
  replied_at?: string | null;
  created_at: string;
};

// ── Minimal markdown renderer (no external deps) ──────────────────────────────

function renderMarkdown(md: string, isDark: boolean): string {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const hColor   = isDark ? '#f1f5f9' : '#1a1a1a';
  const quoteClr = isDark ? '#94a3b8' : '#6b7280';
  const quoteBdr = isDark ? '#1e3a5f' : '#cbd5e1';
  const codeClr  = isDark ? '#93c5fd' : '#1d4ed8';
  const codeBg   = isDark ? 'rgba(30,58,95,0.5)' : '#eff6ff';
  const hrClr    = isDark ? '#1e293b' : '#e5e7eb';
  const linkClr  = isDark ? '#60a5fa' : '#2563eb';

  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  let listType = '';

  const closeList = () => {
    if (inList) { out.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
  };

  const inlineStyles = (s: string) =>
    s
      .replace(/`([^`]+)`/g, `<code style="font-family:'DM Mono',monospace;font-size:0.85em;background:${codeBg};color:${codeClr};padding:2px 6px;border-radius:4px;">$1</code>`)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, `<img src="$2" alt="$1" style="max-width:100%;border-radius:6px;vertical-align:middle;display:block;margin:0.5rem 0;" loading="lazy" onerror="this.onerror=null;this.style.display='none';" />`)
      .replace(/\[(.+?)\]\((.+?)\)/g, `<a href="$2" target="_blank" rel="noopener noreferrer" style="color:${linkClr};text-decoration:underline;text-underline-offset:3px;">$1</a>`);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (/^---+$/.test(line)) {
      closeList();
      out.push(`<hr style="border:none;border-top:1px solid ${hrClr};margin:2.5rem 0;" />`);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.+)/);
    if (h) {
      closeList();
      const lvl = h[1].length;
      const sizes = ['2em','1.5em','1.2em','1em'];
      const sz = sizes[lvl - 1];
      const ff = lvl <= 2 ? `font-family:"Playfair Display",serif;` : '';
      out.push(`<h${lvl} style="${ff}font-size:${sz};font-weight:${lvl<=2?800:700};color:${hColor};margin:${lvl<=2?'2.2rem':'1.5rem'} 0 0.6rem;line-height:1.2;">${inlineStyles(esc(h[2]))}</h${lvl}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      closeList();
      const txt = line.replace(/^>\s?/, '');
      out.push(`<blockquote style="border-left:3px solid ${quoteBdr};margin:1.5rem 0;padding:0.8rem 1.2rem;color:${quoteClr};font-style:italic;font-size:1.05em;">${inlineStyles(esc(txt))}</blockquote>`);
      continue;
    }
    const ul = line.match(/^[-*]\s+(.+)/);
    if (ul) {
      if (!inList || listType !== 'ul') { closeList(); out.push('<ul style="margin:1rem 0;padding-left:1.5rem;">'); inList = true; listType = 'ul'; }
      out.push(`<li style="margin:0.35rem 0;line-height:1.75;">${inlineStyles(esc(ul[1]))}</li>`);
      continue;
    }
    const ol = line.match(/^\d+\.\s+(.+)/);
    if (ol) {
      if (!inList || listType !== 'ol') { closeList(); out.push('<ol style="margin:1rem 0;padding-left:1.5rem;">'); inList = true; listType = 'ol'; }
      out.push(`<li style="margin:0.35rem 0;line-height:1.75;">${inlineStyles(esc(ol[1]))}</li>`);
      continue;
    }
    closeList();
    if (line.trim() === '') { out.push('<div style="margin:0.9rem 0;"></div>'); continue; }
    // Block-level image: a line that is solely an image tag (optionally followed by {caption})
    const imgBlock = line.match(/^!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]*)\})?$/);
    if (imgBlock) {
      const [, alt, src, caption] = imgBlock;
      const cap = caption?.trim();
      out.push(
        `<figure style="margin:2rem 0;text-align:center;">` +
        `<img src="${esc(src)}" alt="${esc(alt)}" style="max-width:100%;border-radius:8px;display:block;margin:0 auto;" loading="lazy" onerror="this.onerror=null;this.style.display='none';" />` +
        (cap ? `<figcaption style="font-size:0.85rem;color:${quoteClr};margin-top:8px;font-style:italic;">${esc(cap)}</figcaption>` : '') +
        `</figure>`
      );
      continue;
    }
    out.push(`<p style="margin:0 0 1.1rem;line-height:1.9;font-size:1.06rem;">${inlineStyles(esc(line))}</p>`);
  }

  closeList();
  return out.join('\n');
}

// ── Share bar ─────────────────────────────────────────────────────────────────

const SHARE_PLATFORMS = [
  {
    key: 'x',
    label: 'X',
    icon: '𝕏',
    color: '#000',
    bg: 'rgba(255,255,255,0.08)',
    border: 'rgba(255,255,255,0.15)',
    url: (u: string, t: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}`,
  },
  {
    key: 'facebook',
    label: 'Facebook',
    icon: 'f',
    color: '#1877f2',
    bg: 'rgba(24,119,242,0.1)',
    border: 'rgba(24,119,242,0.25)',
    url: (u: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}`,
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    icon: 'in',
    color: '#0a66c2',
    bg: 'rgba(10,102,194,0.1)',
    border: 'rgba(10,102,194,0.25)',
    url: (u: string, t: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}`,
  },
  {
    key: 'reddit',
    label: 'Reddit',
    icon: '⬆',
    color: '#ff4500',
    bg: 'rgba(255,69,0,0.1)',
    border: 'rgba(255,69,0,0.25)',
    url: (u: string, t: string) => `https://reddit.com/submit?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}`,
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    icon: '💬',
    color: '#25d366',
    bg: 'rgba(37,211,102,0.1)',
    border: 'rgba(37,211,102,0.25)',
    url: (u: string, t: string) => `https://api.whatsapp.com/send?text=${encodeURIComponent(t + ' ' + u)}`,
  },
  {
    key: 'telegram',
    label: 'Telegram',
    icon: '✈',
    color: '#229ed9',
    bg: 'rgba(34,158,217,0.1)',
    border: 'rgba(34,158,217,0.25)',
    url: (u: string, t: string) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}`,
  },
];

function ShareBar({ post, isDark, border, accent, muted, cardBg }: {
  post: Post; isDark: boolean; border: string; accent: string; muted: string; cardBg: string;
}) {
  const [copied, setCopied]       = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  const pageUrl   = window.location.href;
  const embedCode = `<iframe src="${pageUrl}" width="100%" height="700" frameborder="0" style="border-radius:8px;border:1px solid #1e293b;" allowfullscreen loading="lazy" title="${post.title}"></iframe>`;

  const share = (p: typeof SHARE_PLATFORMS[0]) => {
    window.open(p.url(pageUrl, post.title), '_blank', 'noopener,noreferrer,width=600,height=500');
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(pageUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyEmbed = async () => {
    await navigator.clipboard.writeText(embedCode).catch(() => {});
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
  };

  const divStyle: React.CSSProperties = { height: 1, background: border, margin: '48px 0 32px' };
  const btnBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px',
    borderRadius: 8, border: '1px solid', cursor: 'pointer', fontSize: 12,
    fontFamily: '"Montserrat",sans-serif', fontWeight: 700, transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const, textDecoration: 'none',
  };

  return (
    <>
      <div style={divStyle} />
      <div style={{ marginBottom: 48 }}>
        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.2em', color: muted, marginBottom: 16 }}>
          Share this article
        </div>

        {/* Platform buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8, marginBottom: 12 }}>
          {SHARE_PLATFORMS.map(p => (
            <button
              key={p.key}
              onClick={() => share(p)}
              style={{ ...btnBase, background: p.bg, borderColor: p.border, color: p.color }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.8'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            >
              <span style={{ fontSize: p.key === 'x' ? 13 : 14, lineHeight: 1 }}>{p.icon}</span>
              {p.label}
            </button>
          ))}

          {/* Copy link */}
          <button
            onClick={copyLink}
            style={{ ...btnBase, background: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9', borderColor: border, color: copied ? '#4ade80' : muted }}
          >
            <span style={{ fontSize: 13 }}>{copied ? '✓' : '🔗'}</span>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>

        {/* Embed toggle */}
        <button
          onClick={() => setShowEmbed(v => !v)}
          style={{ ...btnBase, background: 'transparent', borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb', color: muted, fontSize: 11 }}
        >
          <span style={{ fontSize: 13 }}>{'</>'}</span>
          {showEmbed ? 'Hide embed code' : 'Embed in your article'}
        </button>

        {/* Embed code panel */}
        {showEmbed && (
          <div style={{ marginTop: 14, background: cardBg, border: `1px solid ${border}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${border}` }}>
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.15em', color: muted, fontFamily: '"DM Mono",monospace' }}>
                iframe embed code
              </span>
              <button
                onClick={copyEmbed}
                style={{ ...btnBase, padding: '4px 12px', fontSize: 11, background: embedCopied ? 'rgba(74,222,128,0.1)' : isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9', borderColor: embedCopied ? 'rgba(74,222,128,0.3)' : border, color: embedCopied ? '#4ade80' : muted }}
              >
                {embedCopied ? '✓ Copied' : 'Copy code'}
              </button>
            </div>
            <pre style={{ margin: 0, padding: '14px', fontSize: 11, fontFamily: '"DM Mono",monospace', color: isDark ? '#93c5fd' : '#1d4ed8', overflowX: 'auto' as const, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const }}>
              {embedCode}
            </pre>
            <div style={{ padding: '8px 14px', borderTop: `1px solid ${border}`, fontSize: 10, color: muted, fontFamily: '"DM Mono",monospace' }}>
              Paste this into any HTML page or article editor to embed this post.
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Reading progress bar ───────────────────────────────────────────────────────

function ReadingProgress({ isDark }: { isDark: boolean }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const total = el.scrollHeight - el.clientHeight;
      setProgress(total > 0 ? (el.scrollTop / total) * 100 : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 2, zIndex: 100, background: isDark ? '#1e293b' : '#e5e7eb' }}>
      <div style={{ height: '100%', width: `${progress}%`, background: isDark ? '#3b82f6' : '#1d4ed8', transition: 'width 0.1s linear' }} />
    </div>
  );
}

// ── SafeImage ─────────────────────────────────────────────────────────────────

function SafeImage({ src, alt, className, isDark, style }: { src: string; alt: string; className?: string; isDark: boolean; style?: React.CSSProperties }) {
  const [error, setError] = useState(false);
  if (!src || error) {
    return (
      <div className={className} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDark ? '#1e293b' : '#f1f5f9' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.3 }}>
          <ImageIcon size={32} color={isDark ? '#60a5fa' : '#94a3b8'} />
        </div>
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} style={style} onError={() => setError(true)} loading="lazy" />;
}

// ── Author initials ───────────────────────────────────────────────────────────

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const ini = parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase() || 'AU';
  return (
    <div style={{
      width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg,#1e3a5f,#2563eb)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 18, fontWeight: 700, color: '#93c5fd',
      fontFamily: '"Montserrat",sans-serif',
    }}>{ini}</div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function BlogPostPage() {
  usePageTracking('blog-post');
  const [, params] = useRoute('/blog/:id');
  const [, navigate]  = useLocation();
  const { darkMode, setDarkMode } = usePublicTheme();
  const [post, setPost]         = useState<Post | null>(null);
  const [related, setRelated]   = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentName, setCommentName] = useState('');
  const [commentMessage, setCommentMessage] = useState('');
  const [commentSending, setCommentSending] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const isDark = darkMode;
  const id = params?.id;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    setComments([]);
    let postCategory = 'Analysis'; // captured in closure so third .then() can use it
    fetch(`/api/blog/${id}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
      .then((data: any) => {
        postCategory = data.category ?? 'Analysis';
        setPost({
          id:         data.id,
          title:      data.title       ?? '',
          excerpt:    data.excerpt     ?? '',
          content:    data.content     ?? '',
          videoUrl:   data.videoUrl    ?? data.video_url ?? '',
          category:   postCategory,
          author:     data.author      ?? 'Admin',
          date:       data.date        ?? '',
          readTime:   data.readTime    ?? data.read_time ?? '5 min',
          imageUrl:   data.imageUrl ?? data.image_url ?? (() => {
            const m = (data.content ?? '').match(/!\[[^\]]*\]\(([^)]+)\)/);
            return m ? m[1] : '';
          })(),
          status:     data.status      ?? 'Published',
          authorData: data.authorData  ?? data.author_data ?? null,
        });
        return Promise.all([
          fetch('/api/blog'),
          fetch(`/api/blog/${id}/comments`),
        ]);
      })
      .then(async ([postsRes, commentsRes]) => {
        const all = postsRes?.ok ? await postsRes.json() : [];
        const commentData = commentsRes?.ok ? await commentsRes.json() : [];
        if (!all) return;
        const mapRelated = (p: any) => {
          const rawImage = p.imageUrl ?? p.image_url ?? '';
          const firstImg = rawImage || (() => {
            const m = (p.content ?? '').match(/!\[[^\]]*\]\(([^)]+)\)/);
            return m ? m[1] : '';
          })();
          return {
            id: p.slug || p.id, title: p.title, excerpt: p.excerpt ?? '',
            content: '', category: p.category ?? 'Analysis',
            author: p.author ?? 'Admin', date: p.date ?? '',
            readTime: p.readTime ?? p.read_time ?? '5 min',
            imageUrl: firstImg, status: p.status, authorData: null,
          };
        };
        const notCurrent = (p: any) => p.id !== id && (p.slug ?? p.id) !== id;
        const sameCat  = all.filter((p: any) => notCurrent(p) && (p.category ?? 'Analysis') === postCategory).slice(0, 5).map(mapRelated);
        const fallback = all.filter((p: any) => notCurrent(p) && (p.category ?? 'Analysis') !== postCategory).slice(0, Math.max(0, 5 - sameCat.length)).map(mapRelated);
        setRelated([...sameCat, ...fallback]);
        setComments(Array.isArray(commentData) ? commentData : []);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  const submitComment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!id || !commentMessage.trim()) return;
    setCommentSending(true);
    setCommentError('');
    try {
      const r = await fetch(`/api/blog/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: commentName.trim(), message: commentMessage.trim() }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed to post comment');
      const saved = await r.json();
      setComments(p => [saved, ...p]);
      setCommentName('');
      setCommentMessage('');
    } catch (err: any) {
      setCommentError(err.message || 'Failed to post comment');
    } finally {
      setCommentSending(false);
    }
  };

  const bg      = isDark ? '#0f172a' : '#FDFCFB';
  const text     = isDark ? '#f1f5f9' : '#1a1a1a';
  const muted    = isDark ? '#94a3b8' : '#6b7280';
  const border   = isDark ? '#1e293b' : '#e5e7eb';
  const cardBg   = isDark ? 'rgba(30,41,59,0.4)' : '#ffffff';
  const accent   = isDark ? '#3b82f6' : '#2563eb';
  const accentL  = isDark ? '#93c5fd' : '#1d4ed8';

  if (loading) return (
    <div style={{ minHeight: '100vh', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: accent, fontFamily: '"DM Mono",monospace', fontSize: 13 }}>Loading…</div>
    </div>
  );

  if (notFound || !post) return (
    <div style={{ minHeight: '100vh', background: bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <p style={{ color: muted, fontFamily: '"Montserrat",sans-serif', fontSize: 14 }}>Post not found.</p>
      <button onClick={() => navigate('/blog')} style={{ color: accentL, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: '"Montserrat",sans-serif', textDecoration: 'underline' }}>← Back to Blog</button>
    </div>
  );

  const ad = post.authorData;
  const postDesc = post.excerpt || post.content.replace(/<[^>]+>/g, '').slice(0, 160);
  const postUrl = `/blog/${(post as any).slug || post.id}`;

  return (
    <>
    <SEOHead
      title={post.title}
      description={postDesc}
      canonical={postUrl}
      ogImage={post.imageUrl || undefined}
      ogType="article"
      author={post.author}
      publishedTime={post.date}
      jsonLd={{
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: postDesc,
        author: { '@type': 'Person', name: post.author },
        datePublished: post.date,
        image: post.imageUrl || undefined,
        publisher: { '@type': 'Organization', name: 'trade&journal', url: 'https://tradeandjournal.com' },
      }}
    />
    <div style={{ minHeight: '100vh', background: bg, color: text, fontFamily: '"Montserrat",sans-serif', transition: 'background 0.5s,color 0.5s' }}>
      <ReadingProgress isDark={isDark} />

      {/* ── Responsive grid styles ─────────────────────────────────────────── */}
      <style>{`
        .bpp-outer { max-width: 1280px; margin: 0 auto; padding: 32px 28px 80px; }
        .bpp-grid  { display: grid; grid-template-columns: 1fr 290px; gap: 0 48px; align-items: start; }
        .bpp-cover { grid-column: 1; grid-row: 1; }
        .bpp-sidebar { grid-column: 2; grid-row: 1 / 3; position: sticky; top: 24px; }
        .bpp-content { grid-column: 1; grid-row: 2; padding-top: 36px; min-width: 0; }
        .bpp-nav-inner { display: flex; align-items: center; justify-content: space-evenly; max-width: 1280px; margin: 0 auto; padding: 0 28px; }
        @media (max-width: 860px) {
          .bpp-outer { padding: 20px 16px 60px; }
          .bpp-grid  { grid-template-columns: 1fr; gap: 0; }
          .bpp-cover   { grid-column: 1; grid-row: 1; }
          .bpp-sidebar { grid-column: 1; grid-row: 3; position: static; margin-top: 48px; }
          .bpp-content { grid-column: 1; grid-row: 2; }
          .bpp-nav-inner { justify-content: flex-start; gap: 28px; min-width: max-content; }
        }
      `}</style>

      {/* ── Category nav (same as blog index) ──────────────────────────────── */}
      <nav style={{
        borderTop: `1px solid ${border}`,
        borderBottom: `1px solid ${border}`,
        padding: '14px 0',
        marginBottom: 0,
        overflowX: 'auto',
      }}>
        <div className="bpp-nav-inner">
          {['All', 'Equities', 'Forex', 'Digital Assets', 'Analysis', 'Backtested Strategies'].map(cat => {
            const active = post.category.toLowerCase() === cat.toLowerCase();
            return (
              <button
                key={cat}
                onClick={() => navigate('/blog')}
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.25em',
                  background: 'none',
                  border: 'none',
                  borderBottom: active ? `2px solid ${accent}` : '2px solid transparent',
                  paddingBottom: 2,
                  cursor: 'pointer',
                  color: active ? accent : (isDark ? '#475569' : '#a8a29e'),
                  transition: 'color 0.2s',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = isDark ? '#93c5fd' : '#57534e'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = isDark ? '#475569' : '#a8a29e'; }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="bpp-outer">
        <div className="bpp-grid">

          {/* ── Cover image ────────────────────────────────────────────── */}
          <div className="bpp-cover">
            {post.imageUrl ? (
              <div style={{ position: 'relative', overflow: 'hidden' }}>
                <SafeImage
                  src={post.imageUrl}
                  alt={post.title}
                  isDark={isDark}
                  style={{ width: '100%', height: 480, objectFit: 'cover', display: 'block', opacity: isDark ? 0.88 : 1 }}
                />
                {/* Bottom gradient overlay */}
                <div style={{ position: 'absolute', inset: 0, background: isDark ? 'linear-gradient(to bottom,transparent 55%,rgba(15,23,42,0.5))' : 'linear-gradient(to bottom,transparent 65%,rgba(253,252,251,0.35))' }} />
                {/* Category + feature tags */}
                <div style={{ position: 'absolute', bottom: 14, left: 16, display: 'flex', gap: 8 }}>
                  {[post.category].map(tag => (
                    <span key={tag} style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '4px 10px', backdropFilter: 'blur(4px)' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ width: '100%', height: 480, background: isDark ? '#1e293b' : '#f1f5f9' }} />
            )}
          </div>

          {/* ── THE INSIGHT sidebar ────────────────────────────────────── */}
          <div className="bpp-sidebar">

            <div style={{ borderBottom: `2px solid ${text}`, marginBottom: 22 }} />

            {related.length === 0 ? (
              <p style={{ fontSize: 12, color: muted }}>No related articles yet.</p>
            ) : related.slice(0, 5).map((r, i) => (
              <div
                key={r.id}
                onClick={() => navigate(`/blog/${r.id}`)}
                style={{ display: 'flex', gap: 12, marginBottom: 0, cursor: 'pointer', paddingBottom: 18, paddingTop: i === 0 ? 0 : 18, borderBottom: `1px solid ${border}`, transition: 'opacity 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.72')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: accent, marginBottom: 5 }}>{r.category}</div>
                  <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: '0.84rem', fontWeight: 800, color: text, lineHeight: 1.35, margin: '0 0 6px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any }}>
                    {r.title}
                  </h3>
                  <div style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: muted }}>
                    {r.author}{r.date ? ` · ${r.date}` : ''}
                  </div>
                </div>
                {r.imageUrl && (
                  <SafeImage
                    src={r.imageUrl}
                    alt={r.title}
                    isDark={isDark}
                    style={{ width: 72, height: 58, objectFit: 'cover', display: 'block', flexShrink: 0 }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* ── Article content (same column width as cover) ────────────── */}
          <main className="bpp-content">

            {/* Back link */}
            <div style={{ marginBottom: 28 }}>
              <button
                onClick={() => navigate('/blog')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: muted, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: '"Montserrat",sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', padding: 0, transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = accentL)}
                onMouseLeave={e => (e.currentTarget.style.color = muted)}
              >
                <ArrowLeft size={14} /> Blog
              </button>
            </div>

            {/* Article header */}
            <header style={{ marginBottom: 40 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.25em', color: accent, marginBottom: 16 }}>
                {post.category}
              </div>
              <h1 style={{
                fontFamily: '"Playfair Display",serif',
                fontSize: 'clamp(1.8rem,4vw,2.8rem)',
                fontWeight: 900,
                lineHeight: 1.12,
                letterSpacing: '-0.02em',
                color: text,
                margin: '0 0 20px',
              }}>
                {post.title}
              </h1>
              {post.excerpt && (
                <p style={{ fontSize: '1.05rem', lineHeight: 1.7, color: muted, margin: '0 0 28px', fontWeight: 500 }}>
                  {post.excerpt}
                </p>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}`, padding: '14px 0', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Initials name={post.author} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: text }}>{post.author}</div>
                    {ad?.bio && <div style={{ fontSize: 11, color: muted, marginTop: 2, maxWidth: 280 }}>{ad.bio}</div>}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                  {post.date && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      <Calendar size={12} /> {post.date}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    <Clock size={12} /> {post.readTime}
                  </div>
                </div>
              </div>

              {/* expertise tags */}
              {ad?.expertise && ad.expertise.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
                  {ad.expertise.map(tag => (
                    <span key={tag} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '3px 10px', border: `1px solid ${isDark ? '#1e3a5f' : '#bfdbfe'}`, color: accentL, background: isDark ? 'rgba(30,58,95,0.3)' : '#eff6ff', borderRadius: 20 }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </header>

            {/* YouTube embed */}
            {post.videoUrl && extractYoutubeId(post.videoUrl) && (
              <div style={{ marginBottom: 40 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.2em', color: muted, marginBottom: 12 }}>Video Version</div>
                <div style={{ width: '100%', borderRadius: 10, overflow: 'hidden', border: `1px solid ${border}` }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${extractYoutubeId(post.videoUrl)}`}
                    title={post.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ display: 'block', width: '100%', aspectRatio: '16/9', border: 'none' }}
                  />
                </div>
              </div>
            )}

            {/* Article body */}
            <article
              ref={contentRef}
              style={{ color: isDark ? '#cbd5e1' : '#374151', fontSize: '1.06rem', lineHeight: 1.9 }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content || '_No content yet._', isDark) }}
            />

            {/* Share bar */}
            <ShareBar post={post} isDark={isDark} border={border} accent={accent} muted={muted} cardBg={cardBg} />

            {/* Author card */}
            <div style={{ marginTop: 60, padding: '28px 32px', background: cardBg, border: `1px solid ${border}`, borderLeft: `4px solid ${accent}` }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <Initials name={post.author} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: accent, marginBottom: 6 }}>Written by</div>
                  <div style={{ fontFamily: '"Playfair Display",serif', fontSize: '1.3rem', fontWeight: 800, color: text, marginBottom: 8 }}>{post.author}</div>
                  {ad?.bio && <p style={{ fontSize: 13, lineHeight: 1.7, color: muted, margin: 0 }}>{ad.bio}</p>}
                  {(ad?.twitter || ad?.linkedin || ad?.telegram) && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
                      {ad.twitter && (
                        <a href={`https://${ad.twitter.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, fontWeight: 700, color: accentL, textDecoration: 'none', letterSpacing: '0.05em' }}>𝕏 Twitter</a>
                      )}
                      {ad.linkedin && (
                        <a href={`https://${ad.linkedin.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, fontWeight: 700, color: accentL, textDecoration: 'none', letterSpacing: '0.05em' }}>in LinkedIn</a>
                      )}
                      {ad.telegram && (
                        <a href={`https://t.me/${ad.telegram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, fontWeight: 700, color: accentL, textDecoration: 'none', letterSpacing: '0.05em' }}>✈ Telegram</a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* More articles (bottom — mobile-friendly supplement to sidebar) */}
            {related.length > 0 && (
              <section style={{ marginTop: 64 }}>
                <div style={{ borderBottom: `4px solid ${accent}`, paddingBottom: 10, marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: '1.3rem', fontWeight: 900, color: text, margin: 0, letterSpacing: '-0.01em' }}>More in {post.category}</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 20 }}>
                  {related.slice(0, 3).map(r => (
                    <article
                      key={r.id}
                      onClick={() => navigate(`/blog/${r.id}`)}
                      style={{ cursor: 'pointer', background: cardBg, border: `1px solid ${border}`, padding: '18px', transition: 'border-color 0.2s,transform 0.2s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = accent; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = border; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
                    >
                      {r.imageUrl && (
                        <SafeImage src={r.imageUrl} alt={r.title} isDark={isDark}
                          style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block', marginBottom: 12 }} />
                      )}
                      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: accent, marginBottom: 7 }}>{r.category}</div>
                      <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: '0.92rem', fontWeight: 800, color: text, lineHeight: 1.3, margin: '0 0 8px' }}>{r.title}</h3>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: muted }}>{r.author} · {r.readTime}</div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* Comments */}
            <section style={{ marginTop: 64 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <MessageCircle size={18} color={accentL} />
                <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: '1.4rem', fontWeight: 900, color: text, margin: 0 }}>Comments</h2>
              </div>
              <form onSubmit={submitComment} style={{ background: cardBg, border: `1px solid ${border}`, padding: 20, marginBottom: 24 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <input value={commentName} onChange={e => setCommentName(e.target.value)} placeholder="Your name" style={{ padding: 12, background: 'transparent', border: `1px solid ${border}`, color: text, outline: 'none' }} />
                  <div />
                </div>
                <textarea value={commentMessage} onChange={e => setCommentMessage(e.target.value)} placeholder="Share your thoughts..." rows={4} style={{ width: '100%', padding: 12, background: 'transparent', border: `1px solid ${border}`, color: text, outline: 'none', marginBottom: 12 }} />
                <button type="submit" disabled={commentSending} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: accent, color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  <Send size={14} />
                  {commentSending ? 'Posting...' : 'Post Comment'}
                </button>
                {commentError && <div style={{ marginTop: 10, color: '#f87171', fontSize: 12 }}>{commentError}</div>}
              </form>
              <div style={{ display: 'grid', gap: 12 }}>
                {comments.length === 0 ? (
                  <div style={{ color: muted, fontSize: 13 }}>No comments yet.</div>
                ) : comments.map(c => (
                  <div key={c.id} style={{ background: cardBg, border: `1px solid ${border}`, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                      <strong>{c.name || 'Anonymous'}</strong>
                      <span style={{ color: muted, fontSize: 11 }}>{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</span>
                    </div>
                    <div style={{ color: isDark ? '#cbd5e1' : '#374151', lineHeight: 1.7 }}>{c.message}</div>
                    {c.reply && (
                      <div style={{ marginTop: 12, padding: 12, borderLeft: `3px solid ${accent}`, background: isDark ? 'rgba(59,130,246,0.08)' : '#eff6ff' }}>
                        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: accentL, marginBottom: 6 }}>Admin reply</div>
                        <div style={{ color: isDark ? '#e2e8f0' : '#1f2937', lineHeight: 1.7 }}>{c.reply}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

          </main>

        </div>
      </div>

    </div>
    </>
  );
}
