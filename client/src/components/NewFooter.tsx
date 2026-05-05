import {
  Twitter,
  Youtube,
  Instagram,
  Facebook,
} from 'lucide-react';

const TelegramIcon = ({ size = 18, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </svg>
);

interface NewFooterProps {
  isDark: boolean;
}

export default function NewFooter({ isDark }: NewFooterProps) {
  const borderColor = isDark ? 'border-white/10' : 'border-black/10';
  const supportHref = '/support';

  return (
    <footer className={`${isDark ? 'bg-[#0d1117]' : 'bg-[#f0f2f5]'} border-t ${borderColor} pt-20 pb-10 px-6 overflow-hidden relative transition-colors`}>
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-20">
          <div className="space-y-6">
            <div className={`text-2xl font-black tracking-tighter ${isDark ? 'text-white' : 'text-black'}`}>
              <span className="text-white">myfm</span><span className="text-blue-500"> | journal</span>
            </div>
            <div className="flex items-center gap-4 pt-2">
              <a href="#" className={`${isDark ? 'text-slate-400 hover:text-[#1DA1F2]' : 'text-slate-500 hover:text-[#1DA1F2]'} transition-colors`} data-testid="link-twitter"><Twitter size={18} fill="currentColor" stroke="none" /></a>
              <a href="#" className={`${isDark ? 'text-slate-400 hover:text-[#FF0000]' : 'text-slate-500 hover:text-[#FF0000]'} transition-colors`} data-testid="link-youtube"><Youtube size={18} /></a>
              <a href="#" className={`${isDark ? 'text-slate-400 hover:text-[#229ED9]' : 'text-slate-500 hover:text-[#229ED9]'} transition-colors`} title="Telegram" data-testid="link-footer-telegram"><TelegramIcon size={18} color="inherit" /></a>
              <a href="#" className={`${isDark ? 'text-slate-400 hover:text-[#1877F2]' : 'text-slate-500 hover:text-[#1877F2]'} transition-colors`} data-testid="link-facebook"><Facebook size={18} fill="currentColor" stroke="none" /></a>
              <a href="#" className={`${isDark ? 'text-slate-400 hover:text-[#E4405F]' : 'text-slate-500 hover:text-[#E4405F]'} transition-colors`} data-testid="link-instagram"><Instagram size={18} /></a>
            </div>
          </div>

          <div>
            <h4 className={`text-[10px] font-black uppercase tracking-[0.3em] mb-8 ${isDark ? 'text-white' : 'text-black'}`}>Markets</h4>
            <ul className={`space-y-4 text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <li><a href="#" className="hover:text-blue-500 transition-colors">Major Forex Pairs</a></li>
              <li><a href="#" className="hover:text-blue-500 transition-colors">US Indices (NAS/SPX)</a></li>
              <li><a href="#" className="hover:text-blue-500 transition-colors">Commodities (Gold/Oil)</a></li>
              <li><a href="#" className="hover:text-blue-500 transition-colors">Cryptocurrency</a></li>
              <li><a href="#" className="hover:text-blue-500 transition-colors">Institutional Order Flow</a></li>
            </ul>
          </div>

          <div>
            <h4 className={`text-[10px] font-black uppercase tracking-[0.3em] mb-8 ${isDark ? 'text-white' : 'text-black'}`}>Resources</h4>
            <ul className={`space-y-4 text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <li><a href="/journal" className="hover:text-blue-500 transition-colors">Free Trading Journal</a></li>
              <li><a href="#tsc" className="hover:text-blue-500 transition-colors">Session Clock (TSC)</a></li>
              <li><a href="#calendar" className="hover:text-blue-500 transition-colors">Economic Calendar</a></li>
              <li><a href="#blog" className="hover:text-blue-500 transition-colors">Strategy Blog</a></li>
              <li><a href="#" className="hover:text-blue-500 transition-colors">Backtesting Data</a></li>
            </ul>
          </div>

          <div>
            <h4 className={`text-[10px] font-black uppercase tracking-[0.3em] mb-8 ${isDark ? 'text-white' : 'text-black'}`}>Stay Updated</h4>
            <p className={`text-[10px] mb-6 uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Get intraday zone alerts and macro updates directly to your inbox.</p>
            <div className={`flex border p-1 ${isDark ? 'bg-white/5 border-white/10' : 'bg-black/5 border-black/10'}`}>
              <input
                type="email"
                placeholder="EMAIL ADDRESS"
                className={`bg-transparent border-none text-[10px] p-2 flex-grow focus:outline-none ${isDark ? 'text-white' : 'text-black'} placeholder:text-slate-500 font-bold`}
                data-testid="input-email-newsletter"
              />
              <button className="bg-blue-500 text-white px-4 text-[10px] font-black uppercase hover:bg-blue-600 transition-colors" data-testid="button-join-newsletter">
                Join
              </button>
            </div>
          </div>
        </div>

        <div className={`pt-10 border-t ${isDark ? 'border-white/5' : 'border-black/5'}`}>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
            <div className="space-y-2">
              <div className={`text-[9px] uppercase tracking-[0.2em] font-bold ${isDark ? 'text-slate-600' : 'text-slate-500'}`}>
                &copy; {new Date().getFullYear()} MYFM | JOURNAL — ALL RIGHTS RESERVED
              </div>
              <div className={`text-[8px] max-w-2xl uppercase leading-relaxed font-bold ${isDark ? 'text-slate-700' : 'text-slate-400'}`}>
                Risk Warning: Trading financial markets involves significant risk. myfm | journal provides educational content and data analytics for informational purposes only. Past performance is not indicative of future results. Never trade with money you cannot afford to lose.
              </div>
            </div>
            <div className={`flex gap-6 text-[9px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <a href="/legal" className="hover:text-blue-500 transition-colors" data-testid="link-privacy">Privacy Policy</a>
              <a href="/legal" className={`${isDark ? 'hover:text-white' : 'hover:text-black'} transition-colors`} data-testid="link-terms">Terms of Service</a>
              <a href="/legal" className={`${isDark ? 'hover:text-white' : 'hover:text-black'} transition-colors`} data-testid="link-contact">Contact</a>
              <a href="/legal" className={`${isDark ? 'hover:text-white' : 'hover:text-black'} transition-colors`}>Support</a>
            </div>
          </div>
        </div>
      </div>

      <div className={`absolute top-0 right-0 w-96 h-96 blur-[120px] rounded-full -mr-48 -mt-48 ${isDark ? 'bg-blue-500/5' : 'bg-blue-500/10'}`}></div>
    </footer>
  );
}