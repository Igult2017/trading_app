import React from "react";
import { ArrowRight } from "lucide-react";
import { InfiniteMovingCards } from "@/components/ui/infinite-moving-cards";
import { cn } from "@/lib/utils";

const row1 = [
  { name: "Alex M.", quote: "The dashboard is incredibly customizable and very convenient to use." },
  { name: "Jordan K.", quote: "I love how MyfmJournal helps me track my performance and improve my strategies." },
  { name: "Sarah T.", quote: "This tool is fantastic — it's made a huge difference to my consistency." },
  { name: "Michael R.", quote: "MyfmJournal has completely changed the way I analyze my trading operations." },
];

const row2 = [
  { name: "Emily W.", quote: "An excellent tool for traders. Easy to use and very comprehensive." },
  { name: "David P.", quote: "I've tried other journaling platforms, but MyfmJournal is by far the best. The automatic MT5 import is a total game changer!" },
  { name: "Jessica L.", quote: "Wasn't expecting much at first but WOW. The stats dashboard is so detailed and customizable." },
  { name: "Chris N.", quote: "The community features have helped me connect with other traders and share strategies." },
];

interface Props { darkMode: boolean; }

export default function TestimonialsSection({ darkMode }: Props) {
  const navFont = { fontFamily: "'Montserrat', sans-serif", fontWeight: 800 };

  return (
    <section
      id="reviews"
      className={cn("py-20 overflow-hidden transition-colors duration-300",
        darkMode ? "bg-slate-900/60" : "bg-slate-50/80")}
    >
      <h2
        className={cn("text-4xl text-center mb-12 font-bold tracking-wide px-4",
          darkMode ? "text-white" : "text-slate-900")}
        style={{ fontFamily: "'Oswald', sans-serif" }}
      >
        Join 10,000+ Traders Who Chose MyfmJournal
      </h2>

      <div className="overflow-hidden px-4 sm:px-8 space-y-4">
        <InfiniteMovingCards items={row1} direction="left" speed="normal" darkMode={darkMode} />
        <InfiniteMovingCards items={row2} direction="right" speed="slow" darkMode={darkMode} />
      </div>

      <div className="text-center mt-12 px-4">
        <div style={{ padding: '6px', borderRadius: '9999px', border: '2px dashed #3b82f6', display: 'inline-block' }}>
          <a
            href="/auth?mode=signup"
            target="myfm_journal"
            className="flex items-center gap-2 px-8 py-3 text-white font-semibold transition-all hover:scale-105"
            style={{ ...navFont, background: 'linear-gradient(to right, #2563eb, #3b82f6)', borderRadius: '9999px', fontSize: '1rem', textDecoration: 'none' }}
          >
            <span>Join us now</span>
            <ArrowRight className="w-5 h-5" />
          </a>
        </div>
      </div>
    </section>
  );
}
