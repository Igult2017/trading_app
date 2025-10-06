import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { TrendingUp, TrendingDown, Minus, Calendar, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface CurrencyPairImpact {
  pair: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  reasoning: string;
}

interface StockImpact {
  sector: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  reasoning: string;
}

interface EventAnalysis {
  expertSentiment: 'bullish' | 'bearish' | 'neutral';
  preReleaseSentiment: 'bullish' | 'bearish' | 'neutral';
  postReleaseSentiment: 'bullish' | 'bearish' | 'neutral' | null;
  currencyPairImpacts: CurrencyPairImpact[];
  stockImpacts: StockImpact[];
  marketImpactAnalysis: string;
  surpriseFactor: string | null;
}

interface EventDetailsDialogProps {
  eventId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getSentimentIcon = (sentiment: 'bullish' | 'bearish' | 'neutral') => {
  if (sentiment === 'bullish') return <TrendingUp className="w-4 h-4 text-green-500" />;
  if (sentiment === 'bearish') return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
};

const getSentimentColor = (sentiment: 'bullish' | 'bearish' | 'neutral') => {
  if (sentiment === 'bullish') return 'text-green-500';
  if (sentiment === 'bearish') return 'text-red-500';
  return 'text-muted-foreground';
};

interface EventAnalysisResponse {
  event: any;
  analysis: EventAnalysis;
}

export default function EventDetailsDialog({ eventId, open, onOpenChange }: EventDetailsDialogProps) {
  const { data, isLoading } = useQuery<EventAnalysisResponse>({
    queryKey: ['/api/economic-events', eventId, 'analysis'],
    enabled: !!eventId && open,
  });

  if (!eventId) return null;

  const event = data?.event;
  const analysis = data?.analysis;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="dialog-event-details">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading event details...</div>
        ) : event && analysis ? (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <DialogTitle className="text-xl font-bold mb-2" data-testid="text-event-title">
                    {event.title}
                  </DialogTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" data-testid="badge-currency">
                      {event.currency || event.countryCode}
                    </Badge>
                    <Badge 
                      variant={event.impactLevel?.toLowerCase() === 'high' ? 'default' : 'outline'}
                      data-testid="badge-impact"
                    >
                      {event.impactLevel?.toUpperCase()}
                    </Badge>
                    {event.isReleased && (
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-500" data-testid="badge-released">
                        Released
                      </Badge>
                    )}
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span data-testid="text-event-time">
                        {format(new Date(event.eventTime), 'MMM dd, yyyy HH:mm')}
                      </span>
                    </div>
                  </div>
                </div>
                {event.impactLevel?.toLowerCase() === 'high' && (
                  <AlertTriangle className="w-6 h-6 text-destructive" />
                )}
              </div>
            </DialogHeader>

            <Separator className="my-4" />

            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  Market Sentiment
                  {getSentimentIcon(event.isReleased && analysis.postReleaseSentiment 
                    ? analysis.postReleaseSentiment 
                    : analysis.preReleaseSentiment)}
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Expert Sentiment</div>
                    <div className={`font-medium capitalize ${getSentimentColor(analysis.expertSentiment)}`} data-testid="text-expert-sentiment">
                      {analysis.expertSentiment}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Pre-Release</div>
                    <div className={`font-medium capitalize ${getSentimentColor(analysis.preReleaseSentiment)}`} data-testid="text-pre-release-sentiment">
                      {analysis.preReleaseSentiment}
                    </div>
                  </div>
                  {event.isReleased && analysis.postReleaseSentiment && (
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">Post-Release</div>
                      <div className={`font-medium capitalize ${getSentimentColor(analysis.postReleaseSentiment)}`} data-testid="text-post-release-sentiment">
                        {analysis.postReleaseSentiment}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-3">Economic Data</h3>
                <div className="grid grid-cols-3 gap-4">
                  {event.previousValue && (
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">Previous</div>
                      <div className="font-mono font-medium" data-testid="text-previous-value">
                        {event.previousValue}
                      </div>
                    </div>
                  )}
                  {event.expectedValue && (
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">Expected</div>
                      <div className="font-mono font-medium" data-testid="text-expected-value">
                        {event.expectedValue}
                      </div>
                    </div>
                  )}
                  {event.actualValue && (
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">Actual</div>
                      <div className="font-mono font-medium" data-testid="text-actual-value">
                        {event.actualValue}
                      </div>
                    </div>
                  )}
                </div>
                {analysis.surpriseFactor && (
                  <div className="mt-3 p-3 bg-muted rounded-md">
                    <div className="text-sm font-medium" data-testid="text-surprise-factor">
                      Surprise Factor: {analysis.surpriseFactor}
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-3">Market Impact Analysis</h3>
                <p className="text-sm leading-relaxed" data-testid="text-market-impact">
                  {analysis.marketImpactAnalysis}
                </p>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-3">Currency Pair Impacts</h3>
                <div className="space-y-2">
                  {analysis.currencyPairImpacts.map((impact, index) => (
                    <div 
                      key={index} 
                      className="p-3 rounded-md border border-border hover-elevate"
                      data-testid={`card-currency-${impact.pair}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium" data-testid={`text-pair-${impact.pair}`}>{impact.pair}</span>
                        <div className="flex items-center gap-1">
                          {getSentimentIcon(impact.sentiment)}
                          <span className={`text-sm font-medium capitalize ${getSentimentColor(impact.sentiment)}`}>
                            {impact.sentiment}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{impact.reasoning}</p>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-semibold mb-3">Stock/Sector Impacts</h3>
                <div className="space-y-2">
                  {analysis.stockImpacts.map((impact, index) => (
                    <div 
                      key={index} 
                      className="p-3 rounded-md border border-border hover-elevate"
                      data-testid={`card-stock-${impact.sector}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium" data-testid={`text-sector-${impact.sector}`}>{impact.sector}</span>
                        <div className="flex items-center gap-1">
                          {getSentimentIcon(impact.sentiment)}
                          <span className={`text-sm font-medium capitalize ${getSentimentColor(impact.sentiment)}`}>
                            {impact.sentiment}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{impact.reasoning}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-muted-foreground">Event not found</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
