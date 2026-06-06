import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { ArrowUpRight, Image as ImageIcon, Sparkles, Archive, Bell } from 'lucide-react';
import { usePublicTheme } from '@/context/PublicThemeContext';
import { useQuery } from '@tanstack/react-query';
import SEOHead from '@/components/SEOHead';

type Article = {
  id: string | number;
  title: string;
  excerpt: string;
  category: string;
  author: string;
  date: string;
  readTime: string;
  imageUrl: string;
};

const QUERY_KEY  = ['/api/blog'];



function extractFirstImage(markdown: string): string {
  if (!markdown) return '';
  const m = markdown.match(/!\[[^\]]*\]\(([^)]+)\)/);
  return m ? m[1] : '';
}

function mapPost(p: any): Article {
  const rawImage = p.imageUrl ?? p.image_url ?? '';
  return {
    id:       p.slug || p.id,   // prefer slug for clean URLs; fall back to UUID
    title:    p.title,
    excerpt:  p.excerpt ?? '',
    category: p.category ?? 'Analysis',
    author:   p.author ?? 'Admin',
    date:     p.date ?? '',
    readTime: p.readTime ?? p.read_time ?? '5 min',
    imageUrl: rawImage || extractFirstImage(p.content ?? ''),
  };
}

function SafeImage({ src, alt, className, isDark }: { src: string; alt: string; className: string; isDark: boolean }) {
  const [error, setError] = useState(false);
  const noSrc = !src || src.trim() === '';
  if (error || noSrc) {
    return (
      <div className={`${className} ${isDark ? 'bg-[#1a2b45] border-[#253a5e]' : 'bg-stone-100 border-stone-200'} flex items-center justify-center border`}>
        <div className="flex flex-col items-center opacity-30">
          <ImageIcon size={24} className={isDark ? 'text-blue-400' : 'text-stone-400'} />
          {!noSrc && (
            <span className={`text-[10px] font-sans font-bold uppercase mt-2 tracking-widest ${isDark ? 'text-blue-500' : 'text-stone-500'}`}>
              Image Unavailable
            </span>
          )}
        </div>
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} onError={() => setError(true)} loading="lazy" />;
}

function SkeletonBlock({ w, h, delay = 0, isDark }: { w: string | number; h: number; delay?: number; isDark: boolean }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 5,
      background: isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
      animation: `blog-pulse 1.5s ${delay}s ease-in-out infinite`,
      flexShrink: 0,
    }} />
  );
}

const categories = ['All', 'Equities', 'Forex', 'Digital Assets', 'Analysis', 'Backtested Strategies'];

export default function BlogPage() {
  const [activeCategory, setActiveCategory] = useState('All');
  const { darkMode } = usePublicTheme();
  const [, navigate] = useLocation();
  const prevCountRef = useRef<number | null>(null);
  const [newBanner, setNewBanner] = useState(false);

  const {
    data: rawPosts,
    isLoading: loading,
    dataUpdatedAt,
    refetch,
  } = useQuery<Article[]>({
    queryKey: QUERY_KEY,
    queryFn: () =>
      fetch('/api/blog')
        .then(r => r.ok ? r.json() : [])
        .then((data: any[] | null) => {
          if (!data || !Array.isArray(data)) return [];
          return data.map(mapPost);
        })
        .catch(() => []),
    staleTime: 2 * 60 * 1000,
    gcTime:    10 * 60 * 1000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
    refetchInterval: false,
  });

  // Cross-tab: refetch immediately when admin publishes a post
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'blog_post_published') refetch();
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [refetch]);

  // Detect when a background refetch brings new posts
  useEffect(() => {
    if (!rawPosts) return;
    const count = rawPosts.length;
    if (prevCountRef.current !== null && count > prevCountRef.current) {
      setNewBanner(true);
    }
    prevCountRef.current = count;
  }, [rawPosts]);

  const handleRefresh = () => { refetch(); setNewBanner(false); };

  const allPosts          = rawPosts ?? [];
  const isDark            = darkMode;
  const filteredArticles  = activeCategory === 'All' ? allPosts : allPosts.filter(a => a.category === activeCategory);
  const featuredArticle   = filteredArticles[0];
  const sideArticles      = filteredArticles.slice(1, 4);
  const archivedArticles  = filteredArticles.slice(4);

  return (
    <>
    <SEOHead
      title="Trading Insights & Education Blog"
      description="Expert articles on Forex, crypto, and commodities trading. Strategy breakdowns, SMC concepts, psychology, and market analysis from professional traders."
      keywords="forex trading blog, trading strategies, SMC trading, smart money concepts, trading psychology, market analysis, forex education"
      canonical="/blog"
    />
    <div
      className={`min-h-screen transition-colors duration-700 selection:bg-blue-400 selection:text-white ${isDark ? 'bg-[#0f172a] text-[#f1f5f9]' : 'bg-[#FDFCFB] text-[#1a1a1a]'}`}
      style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
    >
      <style>{`
        @keyframes marquee     { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes blog-pulse  { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes blog-spin   { to{transform:rotate(360deg)} }
        @keyframes blog-banner { from{transform:translateY(-100%);opacity:0} to{transform:translateY(0);opacity:1} }
        .blog-animate-marquee  { display:inline-flex; animation:marquee 35s linear infinite; }
        .scrollbar-hide::-webkit-scrollbar { display:none; }
        .scrollbar-hide { -ms-overflow-style:none; scrollbar-width:none; }
      `}</style>

      {/* ── New posts banner ────────────────────────────────────────────── */}
      {newBanner && (
        <div
          style={{
            position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
            zIndex: 100, display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 20px', borderRadius: 24,
            background: isDark ? '#1e293b' : '#ffffff',
            border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            animation: 'blog-banner 0.3s ease-out',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
            color: isDark ? '#f1f5f9' : '#0f172a',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onClick={handleRefresh}
        >
          <Bell size={14} color="#2563eb" />
          New posts available — click to reload
          <button
            onClick={e => { e.stopPropagation(); setNewBanner(false); }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: isDark ? '#475569' : '#94a3b8', marginLeft: 4, padding: 0, lineHeight: 1, fontSize: 16 }}
            aria-label="Dismiss"
          >×</button>
        </div>
      )}

      <main className="max-w-[1280px] mx-auto px-7 py-8">

        {/* Category nav */}
        <nav className={`border-y py-4 mb-10 overflow-x-auto scrollbar-hide transition-colors duration-700 ${isDark ? 'border-[#1e293b]' : 'border-stone-200'}`}>
          <div className="flex items-center gap-8 px-7 min-w-max lg:min-w-0 lg:gap-0 lg:px-0 lg:justify-evenly">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`text-[9px] font-extrabold uppercase tracking-[0.25em] transition-all shrink-0 pb-0.5 whitespace-nowrap ${activeCategory === cat ? (isDark ? 'text-white border-b-2 border-white' : 'text-blue-600 border-b-2 border-blue-600') : (isDark ? 'text-[#475569] hover:text-blue-300' : 'text-stone-400 hover:text-stone-600')}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </nav>

        {/* ── Skeleton loading state (first load) ─────────────────────── */}
        {loading && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Featured skeleton */}
            <div className="lg:col-span-8 flex flex-col gap-5">
              <SkeletonBlock w="100%" h={360} isDark={isDark} />
              <SkeletonBlock w="60%" h={14} isDark={isDark} delay={0.05} />
              <SkeletonBlock w="90%" h={36} isDark={isDark} delay={0.1} />
              <SkeletonBlock w="80%" h={20} isDark={isDark} delay={0.15} />
              <SkeletonBlock w="50%" h={12} isDark={isDark} delay={0.2} />
            </div>
            {/* Sidebar skeleton */}
            <div className="lg:col-span-4 flex flex-col gap-8">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex gap-4">
                  <div className="flex-1 flex flex-col gap-2">
                    <SkeletonBlock w="40%" h={10} isDark={isDark} delay={i * 0.05} />
                    <SkeletonBlock w="90%" h={16} isDark={isDark} delay={i * 0.07} />
                    <SkeletonBlock w="60%" h={10} isDark={isDark} delay={i * 0.09} />
                  </div>
                  <SkeletonBlock w={80} h={80} isDark={isDark} delay={i * 0.06} />
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && allPosts.length === 0 && (
          <div className={`text-center py-24 border ${isDark ? 'border-[#1e293b] text-slate-500' : 'border-stone-200 text-stone-400'}`}>
            <Archive size={28} className="mx-auto mb-4 opacity-50" />
            <div className="text-[11px] font-extrabold uppercase tracking-[0.25em] mb-2">No posts yet</div>
            <div className="text-[10px] font-medium opacity-70">Check back soon for new articles.</div>
          </div>
        )}

        {!loading && allPosts.length > 0 && filteredArticles.length === 0 && (
          <div className={`text-center py-24 text-[11px] font-bold uppercase tracking-[0.25em] ${isDark ? 'text-slate-500' : 'text-stone-400'}`}>
            No posts in "{activeCategory}".
          </div>
        )}

        {/* ── Layout Grid ───────────────────────────────────────────────── */}
        {!loading && featuredArticle && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">

            {/* Featured Article */}
            <section onClick={() => navigate(`/blog/${featuredArticle.id}`)} className={`lg:col-span-8 group cursor-pointer lg:border-r lg:pr-12 transition-colors duration-700 ${isDark ? 'border-[#1e293b]' : 'border-stone-100'}`}>
              <div className={`relative overflow-hidden mb-8 h-[320px] border transition-colors duration-700 ${isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-stone-100 border-stone-200'}`}>
                {featuredArticle.imageUrl && (
                  <SafeImage
                    src={featuredArticle.imageUrl}
                    isDark={isDark}
                    className={`w-full h-full object-cover transition-all duration-[2000ms] ease-out group-hover:scale-105 ${isDark ? 'opacity-80 group-hover:opacity-100' : 'grayscale-[20%] group-hover:grayscale-0'}`}
                    alt="Main Feature"
                  />
                )}
              </div>
              <div className="max-w-2xl">
                <div className={`text-[10px] font-extrabold uppercase tracking-widest mb-4 ${isDark ? 'text-blue-500' : 'text-blue-600'}`}>
                  {featuredArticle.category} <span className="mx-2 opacity-30">|</span> Feature
                </div>
                <h2
                  className={`text-4xl md:text-5xl font-black leading-[1.1] mb-6 tracking-tight transition-colors ${isDark ? 'text-white group-hover:text-blue-300' : 'group-hover:text-stone-700'}`}
                  style={{ fontFamily: '"Playfair Display", serif' }}
                >
                  {featuredArticle.title}
                </h2>
                <p className={`text-lg leading-relaxed mb-8 transition-colors duration-700 font-medium ${isDark ? 'text-slate-400' : 'text-stone-500'}`}>
                  {featuredArticle.excerpt}
                </p>
                <div className={`flex items-center justify-between border-t pt-6 transition-colors duration-700 ${isDark ? 'border-[#1e293b]' : 'border-stone-100'}`}>
                  <div className={`text-[9px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-stone-400'}`}>
                    By {featuredArticle.author} <span className="mx-2 opacity-30">—</span> {featuredArticle.readTime} Read
                  </div>
                  <ArrowUpRight size={18} className={`transition-all ${isDark ? 'text-blue-400 group-hover:text-blue-200' : 'text-stone-300 group-hover:text-stone-900'} group-hover:translate-x-1 group-hover:-translate-y-1`} />
                </div>
              </div>
            </section>

            {/* Sidebar */}
            <aside className="lg:col-span-4">
              <div className="space-y-10">

                <div className={`border-b-4 pb-2 mb-8 transition-colors duration-700 ${isDark ? 'border-blue-500' : 'border-stone-900'}`} />

                <div className="space-y-10">
                  {(sideArticles.length > 0 ? sideArticles : allPosts.slice(1)).map((art) => (
                    <article key={art.id} onClick={() => navigate(`/blog/${art.id}`)} className="group cursor-pointer">
                      <div className="flex gap-5">
                        <div className="flex-1">
                          <div className={`text-[8px] font-extrabold uppercase tracking-widest mb-2 ${isDark ? 'text-blue-500' : 'text-blue-600'}`}>{art.category}</div>
                          <h4
                            className={`text-xl font-bold leading-tight mb-3 tracking-tighter transition-colors ${isDark ? 'text-white group-hover:text-blue-300' : 'group-hover:text-stone-600'}`}
                            style={{ fontFamily: '"Playfair Display", serif' }}
                          >
                            {art.title}
                          </h4>
                          <div className={`text-[8px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-stone-400'}`}>
                            {art.author} <span className="mx-1">•</span> {art.date}
                          </div>
                        </div>
                        {art.imageUrl && (
                          <div className={`w-20 h-20 sm:w-24 sm:h-24 overflow-hidden shrink-0 border transition-colors duration-700 ${isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-stone-100 border-stone-100'}`}>
                            <SafeImage
                              src={art.imageUrl}
                              isDark={isDark}
                              className={`w-full h-full object-cover transition-all duration-700 ${isDark ? 'opacity-80 group-hover:opacity-100' : 'grayscale group-hover:grayscale-0'}`}
                              alt={art.title}
                            />
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>

                {/* Newsletter Block */}
                <div className={`mt-12 p-8 border-l-4 transition-all duration-700 ${isDark ? 'border-blue-500 bg-[#1e293b]/30' : 'border-stone-900 bg-stone-50'}`}>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles size={16} className={isDark ? 'text-blue-400' : 'text-stone-900'} />
                    <p className={`text-[11px] font-extrabold tracking-tight uppercase ${isDark ? 'text-blue-100' : 'text-stone-900'}`}>
                      subscribe to timely market setups and insights
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <input
                      type="email"
                      placeholder="your@email.com"
                      className={`w-full border px-4 py-3 text-[11px] font-bold uppercase tracking-wider focus:outline-none transition-colors duration-500 ${isDark ? 'bg-[#0f172a] border-[#334155] text-white focus:border-blue-500' : 'bg-white border-stone-200 focus:border-stone-900'}`}
                    />
                    <button className={`w-full px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.2em] transition-all active:scale-95 ${isDark ? 'bg-blue-500 text-white hover:bg-blue-400' : 'bg-stone-900 text-white hover:bg-stone-800'}`}>
                      Join Now
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}

        {/* Archive Section */}
        {archivedArticles.length > 0 && (
          <section className="mt-20">
            <div className={`flex items-center gap-3 border-b-4 pb-3 mb-10 transition-colors duration-700 ${isDark ? 'border-blue-500' : 'border-stone-900'}`}>
              <Archive size={20} className={isDark ? 'text-blue-400' : 'text-stone-900'} />
              <h2
                className={`text-2xl font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-stone-900'}`}
                style={{ fontFamily: '"Playfair Display", serif' }}
              >
                Archive
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {archivedArticles.map((post) => (
                <article key={post.id} onClick={() => navigate(`/blog/${post.id}`)} className={`group cursor-pointer p-6 border transition-all duration-300 ${isDark ? 'bg-[#1e293b]/30 border-[#334155] hover:border-blue-500' : 'bg-white border-stone-200 hover:border-stone-400'}`}>
                  <div className={`text-[8px] font-extrabold uppercase tracking-widest mb-3 ${isDark ? 'text-blue-500' : 'text-blue-600'}`}>
                    {post.category}
                  </div>
                  <h3
                    className={`text-lg font-bold leading-tight mb-4 tracking-tight transition-colors ${isDark ? 'text-white group-hover:text-blue-300' : 'text-stone-900 group-hover:text-blue-600'}`}
                    style={{ fontFamily: '"Playfair Display", serif' }}
                  >
                    {post.title}
                  </h3>
                  <div className={`flex items-center justify-between text-[8px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-stone-400'}`}>
                    <span>{post.author}</span>
                    <span>{post.date} <span className="mx-1">•</span> {post.readTime}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
    </>
  );
}
