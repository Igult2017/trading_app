import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { ArrowUpRight, Image as ImageIcon, Sparkles, Archive } from 'lucide-react';
import HomeHeader from '@/components/HomeHeader';
import HomeFooter from '@/components/HomeFooter';
import { usePageTracking } from '@/hooks/usePageTracking';

type Article = {
  id: string | number;
  title: string;
  excerpt: string;
  category: string;
  author: string;
  date: string;
  readTime: string;
  image: string;
};

function SafeImage({ src, alt, className, isDark }: { src: string; alt: string; className: string; isDark: boolean }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className={`${className} ${isDark ? 'bg-[#1a2b45] border-[#253a5e]' : 'bg-stone-100 border-stone-200'} flex items-center justify-center border`}>
        <div className="flex flex-col items-center opacity-30">
          <ImageIcon size={24} className={isDark ? 'text-blue-400' : 'text-stone-400'} />
          <span className={`text-[10px] font-sans font-bold uppercase mt-2 tracking-widest ${isDark ? 'text-blue-500' : 'text-stone-500'}`}>
            Image Unavailable
          </span>
        </div>
      </div>
    );
  }

  return (
    <img src={src} alt={alt} className={className} onError={() => setError(true)} loading="lazy" />
  );
}

const categories = ['All', 'Equities', 'Forex', 'Digital Assets', 'Analysis', 'Backtested Strategies'];

export default function BlogPage() {
  usePageTracking('blog');
  const [activeCategory, setActiveCategory] = useState('All');
  const [darkMode, setDarkMode] = useState(true);
  const [location, navigate] = useLocation();
  const [apiPosts, setApiPosts] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/blog')
      .then(r => r.ok ? r.json() : [])
      .then((data: any[] | null) => {
        if (!data || !Array.isArray(data)) {
          setApiPosts([]);
          return;
        }
        setApiPosts(data.map(p => ({
          id:       p.id,
          title:    p.title,
          excerpt:  p.excerpt ?? '',
          category: p.category ?? 'Analysis',
          author:   p.author ?? 'Admin',
          date:     p.date ?? '',
          readTime: p.readTime ?? p.read_time ?? '5 min',
          image:    p.imageUrl ?? p.image_url ?? '',
        })));
      })
      .catch(() => setApiPosts([]))
      .finally(() => setLoading(false));
  }, []);

  const allPosts = apiPosts;
  const isDark = darkMode;

  const filteredArticles = activeCategory === 'All'
    ? allPosts
    : allPosts.filter(a => a.category === activeCategory);

  const featuredArticle = filteredArticles[0];
  const sideArticles = filteredArticles.slice(1, 4);
  const archivedArticles = filteredArticles.slice(4);

  return (
    <div
      className={`min-h-screen transition-colors duration-700 selection:bg-blue-400 selection:text-white ${isDark ? 'bg-[#0f172a] text-[#f1f5f9]' : 'bg-[#FDFCFB] text-[#1a1a1a]'}`}
      style={{ fontFamily: '"Montserrat", sans-serif' }}
    >
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .blog-animate-marquee {
          display: inline-flex;
          animation: marquee 35s linear infinite;
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <HomeHeader darkMode={darkMode} setDarkMode={setDarkMode} activePath={location} />

      <main className="max-w-[1200px] mx-auto p-6 md:px-12 md:py-8">

        {/* Category Navigation */}
        <nav className={`flex items-center justify-center space-x-6 sm:space-x-10 border-y py-4 mb-10 overflow-x-auto whitespace-nowrap scrollbar-hide transition-colors duration-700 ${isDark ? 'border-[#1e293b]' : 'border-stone-200'}`}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`text-[9px] font-extrabold uppercase tracking-[0.25em] transition-all ${activeCategory === cat ? (isDark ? 'text-white border-b-2 border-white' : 'text-blue-600 border-b-2 border-blue-600') : (isDark ? 'text-[#475569] hover:text-blue-300' : 'text-stone-400 hover:text-stone-600')}`}
            >
              {cat}
            </button>
          ))}
        </nav>

        {/* Empty / loading states */}
        {loading && (
          <div className={`text-center py-24 text-[11px] font-bold uppercase tracking-[0.25em] ${isDark ? 'text-slate-500' : 'text-stone-400'}`}>
            Loading posts…
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
            No posts in “{activeCategory}”.
          </div>
        )}

        {/* Layout Grid */}
        {!loading && featuredArticle && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">

          {/* Featured Article */}
          <section onClick={() => navigate(`/blog/${featuredArticle.id}`)} className={`lg:col-span-8 group cursor-pointer lg:border-r lg:pr-12 transition-colors duration-700 ${isDark ? 'border-[#1e293b]' : 'border-stone-100'}`}>
            <div className={`relative overflow-hidden mb-8 aspect-[16/9] border transition-colors duration-700 ${isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-stone-100 border-stone-200'}`}>
              <SafeImage
                src={featuredArticle.image}
                isDark={isDark}
                className={`w-full h-full object-cover transition-all duration-[2000ms] ease-out group-hover:scale-105 ${isDark ? 'opacity-80 group-hover:opacity-100' : 'grayscale-[20%] group-hover:grayscale-0'}`}
                alt="Main Feature"
              />
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
              <div className={`flex items-center justify-between border-b-4 pb-2 mb-8 transition-colors duration-700 ${isDark ? 'border-blue-500' : 'border-stone-900'}`}>
                <h3 className={`text-[11px] font-extrabold uppercase tracking-[0.2em] ${isDark ? 'text-blue-200' : ''}`}>The Insight</h3>
                <span className={`text-[10px] font-bold uppercase tracking-tighter ${isDark ? 'text-blue-500' : 'text-stone-400'}`}>Latest</span>
              </div>

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
                      <div className={`w-20 h-20 sm:w-24 sm:h-24 overflow-hidden shrink-0 border transition-colors duration-700 ${isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-stone-100 border-stone-100'}`}>
                        <SafeImage
                          src={art.image}
                          isDark={isDark}
                          className={`w-full h-full object-cover transition-all duration-700 ${isDark ? 'opacity-80 group-hover:opacity-100' : 'grayscale group-hover:grayscale-0'}`}
                          alt={art.title}
                        />
                      </div>
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

      <HomeFooter />
    </div>
  );
}
