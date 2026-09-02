import { useState, useEffect, useRef, useMemo } from 'react';
import { useRoute, useLocation } from 'wouter';
import { ChevronLeft, Clock, Calendar, Image as ImageIcon, MessageCircle, Send } from 'lucide-react';
import { usePublicTheme } from '@/context/PublicThemeContext';
import { useQuery } from '@tanstack/react-query';
import { usePageTracking } from '@/hooks/usePageTracking';
import SEOHead from '@/components/SEOHead';
import { tone, SERIF, SANS } from '@/components/blog/blogTheme';

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
  // Article body colours come from the shared blog palette, not a second set invented here.
  const T = tone(isDark);
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const hColor   = T.title;
  const quoteClr = T.quoteInk;
  const quoteBdr = T.quoteEdge;
  const codeClr  = T.codeInk;
  const codeBg   = T.codeBg;
  const hrClr    = T.rule;
  const linkClr  = T.link;

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
      // ALL heading levels, not just h1/h2 — the page font is now sans, so an unnamed h3 would
      // silently stop being a serif heading (2026-08-29).
      const ff = `font-family:${SERIF.replace(/'/g, '"')};`;
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
    fontFamily: '"Playfair Display",serif', fontWeight: 700, transition: 'all 0.15s',
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
            style={{ ...btnBase, background: tone(isDark).subtle, borderColor: border, color: copied ? tone(isDark).accent : muted }}
          >
            <span style={{ fontSize: 13 }}>{copied ? '✓' : '🔗'}</span>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>

        {/* Embed toggle */}
        <button
          onClick={() => setShowEmbed(v => !v)}
          style={{ ...btnBase, background: 'transparent', borderColor: border, color: muted, fontSize: 11 }}
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
                style={{ ...btnBase, padding: '4px 12px', fontSize: 11, background: embedCopied ? tone(isDark).codeBg : tone(isDark).subtle, borderColor: embedCopied ? tone(isDark).accent : border, color: embedCopied ? tone(isDark).accent : muted }}
              >
                {embedCopied ? '✓ Copied' : 'Copy code'}
              </button>
            </div>
            <pre style={{ margin: 0, padding: '14px', fontSize: 11, fontFamily: '"DM Mono",monospace', color: tone(isDark).codeInk, overflowX: 'auto' as const, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const }}>
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
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 2, zIndex: 100, background: tone(isDark).rule }}>
      <div style={{ height: '100%', width: `${progress}%`, background: tone(isDark).accent, transition: 'width 0.1s linear' }} />
    </div>
  );
}

// ── SafeImage ─────────────────────────────────────────────────────────────────

function SafeImage({ src, alt, className, isDark, style }: { src: string; alt: string; className?: string; isDark: boolean; style?: React.CSSProperties }) {
  const [error, setError] = useState(false);
  if (!src || error) {
    return (
      <div className={className} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tone(isDark).placeholder }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.3 }}>
          <ImageIcon size={32} color={tone(isDark).tagInk} />
        </div>
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} style={style} onError={() => setError(true)} loading="lazy" />;
}

// ── Author initials ───────────────────────────────────────────────────────────

function Initials({ name, isDark }: { name: string; isDark: boolean }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const ini = parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase() || 'AU';
  return (
    <div style={{
      width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
      // THE LAST HARDCODED GREEN. Everything else came from the palette, so recolouring that file
      // moved the whole page except this avatar, which had its own literal pair.
      background: `linear-gradient(135deg,${tone(isDark).accent},${tone(isDark).link})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 18, fontWeight: 700, color: '#FFFFFF',
      fontFamily: '"Playfair Display",serif',
    }}>{ini}</div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function BlogPostPage() {
  usePageTracking('blog-post');
  const [, params] = useRoute('/blog/:id');
  const [, navigate]  = useLocation();
  const { darkMode, setDarkMode } = usePublicTheme();
  // THE POST LIST, FETCHED ONCE — for the related-articles sidebar and the strip at the end.
  //
  // It used to be fetched TWICE on this page: here through React Query for the category nav, and
  // again as a raw `fetch('/api/blog')` inside the article's own `.then()` for the related posts.
  // The raw one bypassed the cache entirely, so every article view downloaded the whole list a
  // second time — and, until the server was trimmed, that list carried the FULL TEXT of every
  // published post. The category nav is gone (replaced by "Back to blog"), so one query now serves
  // the only remaining need, and it shares its key with the blog index and the editor.
  const { data: allPosts = [] } = useQuery<any[]>({
    queryKey: ['/api/blog'],
    queryFn: async () => {
      const r = await fetch('/api/blog');
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const [post, setPost]         = useState<Post | null>(null);
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
    let postCategory = 'Analysis';

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

      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  // RELATED POSTS ARE DERIVED FROM THE LIST ALREADY IN HAND — no request of their own. Same
  // instrument as before (five from this category, topped up from the rest), computed rather than
  // fetched, so the sidebar appears as soon as the cached list does.
  const related = useMemo<Post[]>(() => {
    if (!id || !Array.isArray(allPosts) || allPosts.length === 0) return [];
    const cat = post?.category ?? 'Analysis';
    const mapRelated = (p: any): Post => ({
      id: p.slug || p.id, title: p.title, excerpt: p.excerpt ?? '',
      // `content` and `videoUrl` are deliberately blank: these objects are the RELATED-POSTS
      // sidebar — a title, an image and a link — and neither field is rendered there. They are
      // present because `Post` requires them.
      content: '', videoUrl: '', category: p.category ?? 'Analysis',
      author: p.author ?? 'Admin', date: p.date ?? '',
      readTime: p.readTime ?? p.read_time ?? '5 min',
      // The server now derives this fallback, so the body no longer has to travel to find a picture.
      imageUrl: p.imageUrl ?? p.image_url ?? '', status: p.status, authorData: null,
    });
    const notCurrent = (p: any) => p.id !== id && (p.slug ?? p.id) !== id;
    const sameCat  = allPosts.filter((p: any) => notCurrent(p) && (p.category ?? 'Analysis') === cat).slice(0, 5).map(mapRelated);
    const fallback = allPosts.filter((p: any) => notCurrent(p) && (p.category ?? 'Analysis') !== cat).slice(0, Math.max(0, 5 - sameCat.length)).map(mapRelated);
    return [...sameCat, ...fallback];
  }, [allPosts, id, post?.category]);

  // COMMENTS GO OUT WITH THE ARTICLE, NOT AFTER IT. They used to be requested inside the article
  // fetch's own `.then()`, so nothing was even asked for until the article had fully arrived — two
  // round trips end to end where one would do. Its own effect means both leave at the same moment.
  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetch(`/api/blog/${id}/comments`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (alive) setComments(Array.isArray(d) ? d : []); })
      .catch(() => {});
    return () => { alive = false; };
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

  // THE SAME PALETTE THE BLOG INDEX USES (2026-08-29). The article page had its own blue-on-slate
  // set, so opening a post threw away the calm green look the listing had just established. These
  // seven names are unchanged, so everything already reading them follows automatically.
  const T        = tone(isDark);
  const bg       = T.page;
  const text     = T.title;
  const muted    = T.meta;
  const border   = T.cardBorder;
  const cardBg   = T.card;
  const accent   = T.accent;
  const accentL  = T.link;

  if (loading) return (
    <div style={{ minHeight: '100vh', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: accent, fontFamily: '"DM Mono",monospace', fontSize: 13 }}>Loading…</div>
    </div>
  );

  if (notFound || !post) return (
    <div style={{ minHeight: '100vh', background: bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <p style={{ color: muted, fontFamily: '"Playfair Display",serif', fontSize: 14 }}>Post not found.</p>
      <button onClick={() => navigate('/blog')} style={{ color: accentL, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: '"Playfair Display",serif', textDecoration: 'underline' }}>← Back to Blog</button>
    </div>
  );

  const ad = post.authorData;
  const postDesc = post.excerpt || post.content.replace(/<[^>]+>/g, '').slice(0, 160);
  const postUrl = `/blog/${(post as any).slug || post.id}`;
  // SOCIAL CRAWLERS NEED AN ABSOLUTE URL. `og:image` is now `/api/blog/:id/image` (the cover no
  // longer travels inside the JSON), and a relative path is simply ignored by Facebook, X and
  // LinkedIn — so the share card would show no picture. It showed none before either: the value
  // used to be a `data:` URI, which those crawlers cannot fetch at all. Made absolute here, which
  // is the first time this page has had a working share image.
  const absoluteOgImage = post.imageUrl
    ? (/^https?:\/\//i.test(post.imageUrl)
        ? post.imageUrl
        : `${typeof window !== 'undefined' ? window.location.origin : ''}${post.imageUrl}`)
    : undefined;

  return (
    <>
    <SEOHead
      title={post.title}
      description={postDesc}
      canonical={postUrl}
      ogImage={absoluteOgImage}
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
        publisher: { '@type': 'Organization', name: 'Trade&Journal', url: 'https://tradeandjournal.com' },
      }}
    />
    {/* READING TEXT IS SANS, HEADLINES ARE SERIF — the same split the blog index uses. The whole
        page used to be set in Playfair, which is handsome on a headline and tiring over a
        1,500-word article at 17px. Every heading below still names the serif explicitly.

        THE BRACES ARE LOAD-BEARING. Written as a bare /* … *​/ between two elements this is not a
        comment at all — it is TEXT, and it printed itself across the top of every article page.
        It typechecked and it built, because text between elements is perfectly legal. */}
    <div style={{ minHeight: '100vh', background: bg, color: text, fontFamily: SANS, transition: 'background 0.5s,color 0.5s' }}>
      <ReadingProgress isDark={isDark} />

      {/* ── Responsive grid styles ─────────────────────────────────────────── */}
      <style>{`
        .bpp-outer  { max-width: 1280px; margin: 0 auto; padding: 8px 32px 80px; }
        /* THE GAP UNDER THE HEADER, on his screenshot: the page started 18px below the header
           bar, which read as the article being jammed against it. 40px (five 8px steps) gives
           it room to sit as its own thing. */
        .bpp-topbar { max-width: 1280px; margin: 0 auto; padding: 40px 32px 0; }
        .bpp-grid  { display: grid; grid-template-columns: 1fr 290px; gap: 0 48px; align-items: start; }
        .bpp-cover { grid-column: 1; grid-row: 1; }
        .bpp-sidebar { grid-column: 2; grid-row: 1 / 3; position: sticky; top: 24px; }
        .bpp-content { grid-column: 1; grid-row: 2; padding-top: 36px; min-width: 0; }
        .bpp-nav-inner { display: flex; align-items: center; justify-content: space-evenly; max-width: 1280px; margin: 0 auto; padding: 0 28px; }
        @media (max-width: 860px) {
          .bpp-outer  { padding: 4px 16px 60px; }
          .bpp-topbar { padding: 24px 16px 0; }
          .bpp-grid  { grid-template-columns: 1fr; gap: 0; }
          .bpp-cover   { grid-column: 1; grid-row: 1; }
          .bpp-sidebar { grid-column: 1; grid-row: 3; position: static; margin-top: 48px; }
          .bpp-content { grid-column: 1; grid-row: 2; }
          .bpp-nav-inner { justify-content: flex-start; gap: 28px; min-width: max-content; }
        }
      `}</style>

      {/* ── Back to blog ─────────────────────────────────────────────────
          REPLACED THE CATEGORY NAV, on his instruction 2026-09-02: *"I need those categories gone
          and replaced with 'back to blog' written in playfair to the far left corner"*.

          The nav did not belong on an ARTICLE page. Filters are a job for the index — you pick a
          topic there and browse. Once you are reading one piece, the only navigation that means
          anything is the way back, and a row of pills competing with the headline is noise. Removing
          it also removed the second `/api/blog` request this page was making, because the pills were
          the only thing that needed it. */}
      <div className="bpp-topbar">
        <button
          onClick={() => navigate('/blog')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontFamily: SERIF, fontSize: 15, fontWeight: 500, color: text,
            transition: 'color .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = accentL)}
          onMouseLeave={e => (e.currentTarget.style.color = text)}
        >
          <ChevronLeft size={16} strokeWidth={2} />
          Back to blog
        </button>
      </div>

      <div className="bpp-outer">
        <div className="bpp-grid">

          {/* ── Cover image ────────────────────────────────────────────── */}
          <div className="bpp-cover">
            {post.imageUrl ? (
              <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 16, border: `1px solid ${border}` }}>
                {/* THE COVER IS A CARD, NOT A BANNER. It was a hard-edged 480px slab bleeding to the
                    container edge; his reference is a rounded panel with room to breathe. The height
                    is now a RATIO with a ceiling, so a tall phone does not get a letterbox and a wide
                    desktop does not get a wall of picture. */}
                <SafeImage
                  src={post.imageUrl}
                  alt={post.title}
                  isDark={isDark}
                  style={{ width: '100%', aspectRatio: '16 / 9', maxHeight: 460, objectFit: 'cover', display: 'block', opacity: isDark ? 0.92 : 1 }}
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
              <div style={{ width: '100%', aspectRatio: '16 / 9', maxHeight: 460, borderRadius: 16, border: `1px solid ${border}`, background: tone(isDark).placeholder }} />
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
                    style={{ width: 76, height: 60, objectFit: 'cover', display: 'block', flexShrink: 0, borderRadius: 10, border: `1px solid ${border}` }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* ── Article content (same column width as cover) ────────────── */}
          <main className="bpp-content">


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
                  <Initials name={post.author} isDark={isDark} />
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
                    <span key={tag} style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '3px 10px', border: `1px solid ${tone(isDark).quoteEdge}`, color: tone(isDark).tagInk, background: tone(isDark).tagBg, borderRadius: 20 }}>
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
              style={{ color: tone(isDark).body, fontSize: '1.06rem', lineHeight: 1.9 }}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content || '_No content yet._', isDark) }}
            />

            {/* Share bar */}
            <ShareBar post={post} isDark={isDark} border={border} accent={accent} muted={muted} cardBg={cardBg} />

            {/* Author card */}
            <div style={{ marginTop: 60, padding: '28px 32px', background: cardBg, border: `1px solid ${border}`, borderLeft: `4px solid ${accent}` }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <Initials name={post.author} isDark={isDark} />
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
                      style={{ cursor: 'pointer', background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: '18px', transition: 'border-color 0.2s,transform 0.2s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = accent; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = border; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
                    >
                      {r.imageUrl && (
                        <SafeImage src={r.imageUrl} alt={r.title} isDark={isDark}
                          style={{ width: '100%', aspectRatio: '16 / 10', height: 'auto', objectFit: 'cover', display: 'block', marginBottom: 12, borderRadius: 10 }} />
                      )}
                      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: accent, marginBottom: 7 }}>{r.category}</div>
                      <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: '0.92rem', fontWeight: 800, color: text, lineHeight: 1.3, margin: '0 0 8px' }}>{r.title}</h3>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: muted }}>{r.author} · {r.readTime}</div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* ── Comments ─────────────────────────────────────────────────
                REDESIGNED 2026-09-02 to the reference he sent — in OUR colours, not its green.

                What changed and why:
                  * the count is IN THE HEADING ("Comments (0)"), so the section says how much
                    conversation there is before you scroll into it;
                  * the name box and the message box are ONE rounded card divided by a hairline,
                    instead of two hard-edged boxes and an empty grid cell that pushed the name
                    input to half width for no reason;
                  * the button is a pill and DIMS UNTIL THERE IS SOMETHING TO POST — the reference
                    shows exactly that, and it is honest: pressing it while empty did nothing;
                  * the empty state is centred and invites a reply rather than reporting a fact. */}
            <section style={{ marginTop: 64 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <MessageCircle size={20} color={accentL} strokeWidth={1.8} />
                <h2 style={{ fontFamily: SERIF, fontSize: '1.5rem', fontWeight: 800, color: text, margin: 0, letterSpacing: '-0.01em' }}>
                  Comments ({comments.length})
                </h2>
              </div>

              <form onSubmit={submitComment} style={{ marginBottom: 22 }}>
                <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color .15s' }}>
                  <input
                    value={commentName}
                    onChange={e => setCommentName(e.target.value)}
                    placeholder="Your name (optional)"
                    style={{ width: '100%', padding: '13px 18px', background: 'transparent', border: 'none',
                             borderBottom: `1px solid ${border}`, color: text, outline: 'none',
                             fontFamily: SANS, fontSize: 14 }}
                  />
                  <textarea
                    value={commentMessage}
                    onChange={e => setCommentMessage(e.target.value)}
                    placeholder="Share your thoughts…"
                    rows={4}
                    style={{ width: '100%', padding: '14px 18px', background: 'transparent', border: 'none',
                             color: text, outline: 'none', resize: 'vertical', minHeight: 96,
                             fontFamily: SANS, fontSize: 15, lineHeight: 1.65 }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={commentSending || !commentMessage.trim()}
                  style={{
                    marginTop: 14,
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 22px', borderRadius: 999, border: 'none',
                    background: commentMessage.trim() ? accent : tone(isDark).subtle,
                    color: commentMessage.trim() ? '#fff' : muted,
                    cursor: commentMessage.trim() && !commentSending ? 'pointer' : 'not-allowed',
                    fontFamily: SANS, fontSize: 14, fontWeight: 600,
                    transition: 'background .15s, color .15s',
                  }}
                >
                  <Send size={15} strokeWidth={2} />
                  {commentSending ? 'Posting…' : 'Post comment'}
                </button>
                {commentError && <div style={{ marginTop: 10, color: '#dc2626', fontSize: 13 }}>{commentError}</div>}
              </form>

              <div style={{ display: 'grid', gap: 14 }}>
                {comments.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '26px 0 8px', color: muted, fontFamily: SANS, fontSize: 14 }}>
                    No comments yet — be the first!
                  </div>
                ) : comments.map(c => (
                  <div key={c.id} style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8, alignItems: 'baseline' }}>
                      <strong style={{ fontFamily: SERIF, fontSize: 15, color: text }}>{c.name || 'Anonymous'}</strong>
                      <span style={{ color: muted, fontSize: 11, fontFamily: SANS, whiteSpace: 'nowrap' }}>
                        {c.created_at ? new Date(c.created_at).toLocaleString() : ''}
                      </span>
                    </div>
                    <div style={{ color: tone(isDark).body, lineHeight: 1.7, fontFamily: SANS, fontSize: 14.5 }}>{c.message}</div>
                    {c.reply && (
                      <div style={{ marginTop: 12, padding: 14, borderRadius: 10, borderLeft: `3px solid ${accent}`, background: tone(isDark).codeBg }}>
                        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: accentL, marginBottom: 6, fontFamily: SANS }}>Admin reply</div>
                        <div style={{ color: tone(isDark).body, lineHeight: 1.7, fontFamily: SANS, fontSize: 14.5 }}>{c.reply}</div>
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
