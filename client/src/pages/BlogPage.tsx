import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'wouter';
import { Bell, Rss } from 'lucide-react';
import { usePublicTheme } from '@/context/PublicThemeContext';
import { useQuery } from '@tanstack/react-query';
import SEOHead from '@/components/SEOHead';
import { ArticleCard, type Article } from '@/components/blog/ArticleCard';
import { BlogSkeleton, BlogNotice } from '@/components/blog/BlogStates';
import { tone, SANS, SERIF } from '@/components/blog/blogTheme';

/**
 * THE BLOG INDEX — rebuilt 2026-08-29 to the reference he sent:
 *
 *   "Can we make the blog to display like this. This one looks clean, less chaotic and also it is
 *    clear. Can you copy even font, background color/theme and arrangement of articles."
 *
 * WHAT MADE THE OLD ONE CHAOTIC, since "less chaotic" was the actual brief. It ran three different
 * article shapes on one screen: the newest post in a huge eight-column slot, the next three in a
 * narrow sidebar, and everything after that as a plain list. Three competing hierarchies, plus
 * 9–10px uppercase labels tracked out to 0.25em. Every card is now the same, and the type is at a
 * readable size — that uniformity IS the fix.
 *
 * Kept exactly as it was: the data fetch, the cross-tab reload when a post is published from the
 * admin panel, the SEO tags, dark mode, and the loading/error/empty states.
 */

const QUERY_KEY = ['/api/blog'];
const PAGE_SIZE = 9;

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

export default function BlogPage({ active = true }: { active?: boolean }) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [shown, setShown] = useState(PAGE_SIZE);
  const { darkMode } = usePublicTheme();
  const [, navigate] = useLocation();
  const prevCountRef = useRef<number | null>(null);
  const [newBanner, setNewBanner] = useState(false);
  const t = tone(darkMode);

  const { data: rawPosts, isLoading: loading, isError, error: queryError, refetch } =
    useQuery<Article[]>({
      queryKey: QUERY_KEY,
      queryFn: async () => {
        const r = await fetch('/api/blog');
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `Server error ${r.status}`);
        }
        const data: any[] = await r.json();
        return Array.isArray(data) ? data.map(mapPost) : [];
      },
      staleTime: 2 * 60 * 1000,
      gcTime:    10 * 60 * 1000,
      placeholderData: (prev) => prev,
      // THE BLOG NOW REFRESHES WHEN YOU COME BACK TO THE TAB — his report: *"the blog is not
      // autoreloading when a new blog is there"*. This was OFF, so leaving the tab and returning
      // showed whatever was there when you left, for up to the 2-minute staleness window.
      //
      // It was a fair setting when this request weighed 2.23 MB. It costs 6 KB now that the cover
      // images travel as cacheable images instead of inside the JSON, so the reason for leaving it
      // off is gone.
      refetchOnWindowFocus: true,
      retry: 2,
    });

  // Cross-tab: reload the moment a post is published from the admin panel.
  useEffect(() => {
    const handler = (e: StorageEvent) => { if (e.key === 'blog_post_published') refetch(); };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [refetch]);

  useEffect(() => {
    if (!rawPosts) return;
    if (prevCountRef.current !== null && rawPosts.length > prevCountRef.current) setNewBanner(true);
    prevCountRef.current = rawPosts.length;
  }, [rawPosts]);

  // IT DISMISSES ITSELF. The articles are already on the page by the time this shows, so there is
  // nothing for him to do about it and no reason for it to sit there until clicked.
  useEffect(() => {
    if (!newBanner) return;
    const id = setTimeout(() => setNewBanner(false), 6000);
    return () => clearTimeout(id);
  }, [newBanner]);

  const allPosts = rawPosts ?? [];

  // THE FILTERS COME FROM THE POSTS. They used to be a hardcoded list of trading topics — Equities,
  // Forex, Digital Assets — which no longer matched what is actually published, so real categories
  // had no filter and the listed ones returned nothing. Derived, they cannot fall out of step.
  const categories = useMemo(
    () => ['All', ...Array.from(new Set(allPosts.map(a => a.category).filter(Boolean))).sort()],
    [allPosts],
  );

  const filtered = activeCategory === 'All'
    ? allPosts
    : allPosts.filter(a => a.category === activeCategory);
  const visible = filtered.slice(0, shown);

  const pick = (cat: string) => { setActiveCategory(cat); setShown(PAGE_SIZE); };

  // Honour ?category= from a link. The article page's category nav sends people here with one, and
  // before this it landed on an unfiltered list — the click looked like it had done nothing.
  // Applied only when the category actually exists in the posts, so a stale or hand-typed link
  // falls back to showing everything rather than an empty page.
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('category');
    if (want && categories.includes(want) && want !== activeCategory) pick(want);
    // categories is what gates it, so this settles once the posts have arrived
  }, [categories.join('|')]);

  return (
    <>
      {active && (
        <SEOHead
          title="Trading Insights & Education Blog"
          description="Expert articles on Forex, crypto, and commodities trading. Strategy breakdowns, trading psychology, and market analysis from traders who log every trade."
          keywords="forex trading blog, trading strategies, trading journal, trading psychology, market analysis, forex education, find your edge"
          canonical="/blog"
        />
      )}

      <div className="min-h-screen transition-colors duration-500"
           style={{ background: t.page, fontFamily: SANS }}>
        <style>{`
          @keyframes blog-pulse  { 0%,100%{opacity:1} 50%{opacity:0.45} }
          @keyframes blog-toast { from{transform:translate(-50%,14px);opacity:0}
                                  to{transform:translate(-50%,0);opacity:1} }
          .blog-toast { animation: blog-toast .25s ease-out; }
          .blog-hide::-webkit-scrollbar { display:none; }
          .blog-hide { -ms-overflow-style:none; scrollbar-width:none; }
          /* THE FILTER ROW HAD NO HOVER AND NO FOCUS RING. It is the page's navigation and is
             reachable by keyboard, so it gave a keyboard user no indication of where they were.
             Written as CSS rather than inline handlers so :focus-visible works — an inline
             onMouseEnter cannot express it, and a mouse click should not leave a ring behind. */
          .blog-pill:hover      { border-color: ${t.accent} !important; transform: translateY(-1px); }
          .blog-pill:focus-visible { outline: 2px solid ${t.accent}; outline-offset: 2px; }
        `}</style>

        {/* ── "New articles added" ───────────────────────────────────────────
            TWO THINGS WERE WRONG WITH THIS, both visible in his screenshot.

            IT WAS PINNED OVER THE HEADER. `fixed top-4` puts it 16px from the top of the WINDOW —
            which is where the price ticker and the site header live — so it landed on top of them
            and read as something broken. It sits at the BOTTOM now, out of the way of everything,
            which is also where it is useful: the point of a floating note is to be seen when you
            are scrolled away from the top.

            AND IT WAS ASKING FOR SOMETHING IT HAD ALREADY DONE. It appeared because the post count
            GREW — which can only happen after the list has refetched and re-rendered, so the new
            articles were ALREADY ON THE PAGE behind it. "Click to reload" reloaded nothing. It is
            now a statement, not an instruction, and it takes itself away after a few seconds. */}
        {newBanner && (
          <div
            role="status"
            aria-live="polite"
            className="blog-toast fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2.5 rounded-full px-4 py-2 text-[12.5px]"
            style={{ background: t.card, border: `1px solid ${t.cardBorder}`, color: t.body,
                     boxShadow: t.cardShadow, fontFamily: SANS }}
          >
            <Bell size={13} style={{ color: t.accent }} aria-hidden="true" />
            New articles added
          </div>
        )}

        <main className="mx-auto max-w-[1280px] px-8 py-10">
          {/* ── PAGE HEADER ───────────────────────────────────────────────────
              The page had NO heading at all — it opened straight onto the filter
              pills, so a visitor landing here had nothing telling them what they
              were looking at (added 2026-08-30, on his reference screenshot).

              THE WORDS ARE HIS, from the home page hero (HomePage.tsx:70 and :74):
              "Find your edge" and "Log trades, capture decisions, and build your
              edge". The blog now opens on the same promise the site does, instead
              of a second tagline invented for one page. */}
          <header className="mb-9">
            <div className="flex items-center gap-2" style={{ color: t.accent }}>
              <Rss size={15} aria-hidden="true" />
              <span className="text-[12px] font-semibold uppercase tracking-[0.18em]">Blog</span>
            </div>
            <h1
              className="mt-3 text-[34px] font-bold leading-[1.15] sm:text-[42px]"
              style={{ fontFamily: SERIF, color: t.title, letterSpacing: '-0.01em' }}
            >
              Find your edge.
            </h1>
            <p className="mt-3 max-w-[620px] text-[15px] leading-relaxed" style={{ color: t.body }}>
              Strategy breakdowns, trading psychology and market analysis — written for
              traders who log their trades and capture the decisions behind them.
            </p>
          </header>

          {/* ── Filters ───────────────────────────────────────────────────────
              RESTYLED 2026-09-02 on his screenshot: *"style this properly and write text here in
              playfair"*.

              The pills were 13px sans in a squeezed box, so they read as small grey chips rather
              than as the page's navigation. They now use the same serif as the headline above them —
              which is what ties them to the page instead of looking bolted on — at a size and
              padding you can actually hit. The selected one is solid brand blue; the rest lift on
              hover, and every one has a visible focus ring, because this row is reachable by
              keyboard and was previously giving no feedback at all. */}
          {categories.length > 1 && (
            <nav aria-label="Filter articles by category"
                 className="blog-hide mb-9 flex gap-2.5 overflow-x-auto pb-1">
              {categories.map(cat => {
                const on = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => pick(cat)}
                    aria-pressed={on}
                    className="blog-pill shrink-0 rounded-full"
                    style={{
                      fontFamily: SERIF,
                      fontSize: 15,
                      fontWeight: on ? 700 : 500,
                      letterSpacing: '0.005em',
                      padding: '9px 20px',
                      lineHeight: 1.2,
                      cursor: 'pointer',
                      background: on ? t.pillActiveBg : t.pillBg,
                      color:      on ? t.pillActiveInk : t.pillInk,
                      border: `1px solid ${on ? t.pillActiveBg : t.pillBorder}`,
                      boxShadow: on ? t.cardShadow : 'none',
                      transition: 'background .15s, color .15s, border-color .15s, transform .15s',
                    }}
                  >
                    {cat}
                  </button>
                );
              })}
            </nav>
          )}

          {loading && allPosts.length === 0 ? (
            <BlogSkeleton dark={darkMode} />
          ) : isError ? (
            <BlogNotice dark={darkMode} head="Couldn't load the articles"
                        sub={(queryError as Error)?.message ?? 'Unknown error'}
                        actionLabel="Try again" onAction={() => refetch()} />
          ) : allPosts.length === 0 ? (
            <BlogNotice dark={darkMode} head="No articles yet"
                        sub="Check back soon for new writing." />
          ) : filtered.length === 0 ? (
            <BlogNotice dark={darkMode} head={`Nothing in "${activeCategory}" yet`}
                        sub="Try another category."
                        actionLabel="Show all articles" onAction={() => pick('All')} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map(a => (
                  <ArticleCard key={a.id} a={a} dark={darkMode}
                               onOpen={() => navigate(`/blog/${a.id}`)} />
                ))}
              </div>

              {visible.length < filtered.length && (
                <div className="mt-12 flex justify-center">
                  <button
                    onClick={() => setShown(n => n + PAGE_SIZE)}
                    className="rounded-full px-8 py-3.5 text-[14px] font-semibold text-white transition-colors duration-150"
                    style={{ background: t.accent }}
                    onMouseEnter={e => (e.currentTarget.style.background = t.accentHover)}
                    onMouseLeave={e => (e.currentTarget.style.background = t.accent)}
                  >
                    Load more articles
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
