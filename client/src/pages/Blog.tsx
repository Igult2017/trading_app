import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BookOpen, Clock, ArrowRight } from 'lucide-react';

const blogPosts = [
  {
    id: 1,
    title: 'Understanding Smart Money Concepts in Forex Trading',
    excerpt: 'Learn how institutional traders move the markets and how to identify their footprints using SMC methodology.',
    category: 'Education',
    date: 'Nov 24, 2025',
    readTime: '8 min read',
  },
  {
    id: 2,
    title: 'Top 5 Currency Pairs to Watch This Week',
    excerpt: 'Our analysis of the most promising forex pairs based on interest rate differentials and technical setups.',
    category: 'Analysis',
    date: 'Nov 23, 2025',
    readTime: '5 min read',
  },
  {
    id: 3,
    title: 'How to Use the Economic Calendar for Better Trades',
    excerpt: 'A comprehensive guide to trading around high-impact economic events and news releases.',
    category: 'Strategy',
    date: 'Nov 22, 2025',
    readTime: '6 min read',
  },
  {
    id: 4,
    title: 'Risk Management: The Key to Long-Term Success',
    excerpt: 'Why proper position sizing and risk-reward ratios matter more than win rate.',
    category: 'Education',
    date: 'Nov 21, 2025',
    readTime: '7 min read',
  },
];

const SectionHeader = ({ icon: Icon, title }: any) => (
  <div className="flex items-center justify-between py-4 border-b-2 border-gray-900 bg-white dark:bg-background px-6">
    <div className="flex items-center gap-3">
      <Icon className="w-5 h-5 text-gray-900 dark:text-foreground" />
      <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground tracking-tight uppercase">{title}</h2>
    </div>
  </div>
);

export default function Blog() {
  return (
    <div className="min-h-screen bg-[#f7f7f7] dark:bg-background text-gray-800 dark:text-foreground p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <section className="bg-white dark:bg-background border-t-2 border-gray-900 dark:border-foreground">
          <SectionHeader icon={BookOpen} title="Trading Insights Blog" />
          
          <div className="p-6 grid gap-6">
            {blogPosts.map((post) => (
              <Card key={post.id} className="hover-elevate transition-all" data-testid={`card-blog-${post.id}`}>
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant="secondary" className="text-xs">
                      {post.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {post.readTime}
                    </span>
                  </div>
                  <CardTitle className="text-xl">{post.title}</CardTitle>
                  <CardDescription className="text-sm">{post.date}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">{post.excerpt}</p>
                  <Button variant="outline" size="sm" data-testid={`button-read-${post.id}`}>
                    Read More
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
