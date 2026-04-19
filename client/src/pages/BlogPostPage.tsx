import { useState, useEffect, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { ArrowLeft, Clock, Calendar, Image as ImageIcon } from 'lucide-react';
import HomeHeader from '@/components/HomeHeader';
import HomeFooter from '@/components/HomeFooter';
import { usePageTracking } from '@/hooks/usePageTracking';

// ── Types ─────────────────────────────────────────────────────────────────────

type Post = {
  id: string | number;
  title: string;
  excerpt: string;
  content: string;
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
    out.push(`<p style="margin:0 0 1.1rem;line-height:1.9;font-size:1.06rem;">${inlineStyles(esc(line))}</p>`);
  }

  closeList();
  return out.join('\n');
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
  const [darkMode, setDarkMode] = useState(true);
  const [post, setPost]         = useState<Post | null>(null);
  const [related, setRelated]   = useState<Post[]>([]);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const isDark = darkMode;
  const id = params?.id;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/blog/${id}`)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
      .then((data: any) => {
        setPost({
          id:         data.id,
          title:      data.title       ?? '',
          excerpt:    data.excerpt     ?? '',
          content:    data.content     ?? '',
          category:   data.category    ?? 'Analysis',
          author:     data.author      ?? 'Admin',
          date:       data.date        ?? '',
          readTime:   data.readTime    ?? data.read_time ?? '5 min',
          imageUrl:   data.imageUrl    ?? data.image_url ?? '',
          status:     data.status      ?? 'Published',
          authorData: data.authorData  ?? data.author_data ?? null,
        });
        // load related posts
        return fetch('/api/blog');
      })
      .then(r => r?.ok ? r.json() : [])
      .then((all: any[]) => {
        if (!all) return;
        setRelated(
          all
            .filter((p: any) => String(p.id) !== String(id))
            .slice(0, 3)
            .map((p: any) => ({
              id: p.id, title: p.title, excerpt: p.excerpt ?? '',
              content: '', category: p.category ?? 'Analysis',
              author: p.author ?? 'Admin', date: p.date ?? '',
              readTime: p.readTime ?? p.read_time ?? '5 min',
              imageUrl: p.imageUrl ?? p.image_url ?? '',
              status: p.status, authorData: null,
            }))
        );
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

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

  return (
    <div style={{ minHeight: '100vh', background: bg, color: text, fontFamily: '"Montserrat",sans-serif', transition: 'background 0.5s,color 0.5s' }}>
      <ReadingProgress isDark={isDark} />
      <HomeHeader darkMode={darkMode} setDarkMode={setDarkMode} activePath="/blog" />

      {/* ── Cover image ───────────────────────────────────────────────────────── */}
      {post.imageUrl && (
        <div style={{ width: '100%', maxHeight: 480, overflow: 'hidden', position: 'relative' }}>
          <SafeImage
            src={post.imageUrl}
            alt={post.title}
            isDark={isDark}
            style={{ width: '100%', height: 480, objectFit: 'cover', display: 'block', opacity: isDark ? 0.85 : 1 }}
          />
          <div style={{ position: 'absolute', inset: 0, background: isDark ? 'linear-gradient(to bottom,transparent 50%,#0f172a)' : 'linear-gradient(to bottom,transparent 60%,#FDFCFB)' }} />
        </div>
      )}

      <main style={{ maxWidth: 780, margin: '0 auto', padding: '0 24px 80px' }}>

        {/* ── Back link ─────────────────────────────────────────────────────── */}
        <div style={{ padding: post.imageUrl ? '0' : '40px 0 0', marginBottom: 32, marginTop: post.imageUrl ? -40 : 0, position: 'relative', zIndex: 1 }}>
          <button
            onClick={() => navigate('/blog')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: muted, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: '"Montserrat",sans-serif', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', padding: 0, transition: 'color 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.color = accentL)}
            onMouseLeave={e => (e.currentTarget.style.color = muted)}
          >
            <ArrowLeft size={14} /> Blog
          </button>
        </div>

        {/* ── Article header ────────────────────────────────────────────────── */}
        <header style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.25em', color: accent, marginBottom: 16 }}>
            {post.category}
          </div>
          <h1 style={{
            fontFamily: '"Playfair Display",serif',
            fontSize: 'clamp(2rem,5vw,3.2rem)',
            fontWeight: 900,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
            color: text,
            margin: '0 0 20px',
          }}>
            {post.title}
          </h1>
          {post.excerpt && (
            <p style={{ fontSize: '1.15rem', lineHeight: 1.7, color: muted, margin: '0 0 28px', fontWeight: 500 }}>
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

        {/* ── Article body ──────────────────────────────────────────────────── */}
        <article
          ref={contentRef}
          style={{ color: isDark ? '#cbd5e1' : '#374151', fontSize: '1.06rem', lineHeight: 1.9 }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content || '_No content yet._', isDark) }}
        />

        {/* ── Author card ───────────────────────────────────────────────────── */}
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

        {/* ── Related posts ─────────────────────────────────────────────────── */}
        {related.length > 0 && (
          <section style={{ marginTop: 64 }}>
            <div style={{ borderBottom: `4px solid ${accent}`, paddingBottom: 10, marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontFamily: '"Playfair Display",serif', fontSize: '1.4rem', fontWeight: 900, color: text, margin: 0, letterSpacing: '-0.01em' }}>More Articles</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 20 }}>
              {related.map(r => (
                <article
                  key={r.id}
                  onClick={() => navigate(`/blog/${r.id}`)}
                  style={{ cursor: 'pointer', background: cardBg, border: `1px solid ${border}`, padding: '20px', transition: 'border-color 0.2s,transform 0.2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = accent; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = border; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
                >
                  {r.imageUrl && (
                    <SafeImage src={r.imageUrl} alt={r.title} isDark={isDark}
                      style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block', marginBottom: 14 }} />
                  )}
                  <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: accent, marginBottom: 8 }}>{r.category}</div>
                  <h3 style={{ fontFamily: '"Playfair Display",serif', fontSize: '1rem', fontWeight: 800, color: text, lineHeight: 1.3, margin: '0 0 10px' }}>{r.title}</h3>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: muted }}>{r.author} · {r.readTime}</div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      <HomeFooter />
    </div>
  );
}
