import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format } from 'date-fns';
import EventDetailsDialog from './EventDetailsDialog';

interface EconomicEvent {
  id: string;
  title: string;
  currency: string;
  countryCode?: string;
  impactLevel: string;
  eventTime: string;
  expectedValue: string | null;
  previousValue: string | null;
  actualValue: string | null;
  marketImpactAnalysis: string | null;
  isReleased: boolean;
  preReleaseSentiment?: string;
  postReleaseSentiment?: string;
  expertSentiment?: string;
}

export default function EconomicCalendar() {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: allEvents = [], isLoading } = useQuery<EconomicEvent[]>({
    queryKey: ['/api/economic-events'],
  });

  const events = allEvents.slice(0, 20);

  const handleEventClick = (eventId: string) => {
    setSelectedEventId(eventId);
    setDialogOpen(true);
  };

  const getImpactVariant = (impact: string): "default" | "secondary" | "outline" => {
    const impactLower = impact?.toLowerCase() || '';
    if (impactLower === 'high') return 'default';
    if (impactLower === 'medium') return 'secondary';
    return 'outline';
  };

  const groupEventsByDate = (events: EconomicEvent[]) => {
    const grouped: { [key: string]: EconomicEvent[] } = {};
    events.forEach(event => {
      const dateKey = format(new Date(event.eventTime), 'yyyy-MM-dd');
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(event);
    });
    return grouped;
  };

  const groupedEvents = groupEventsByDate(events);

  const getMarketSentiment = (event: EconomicEvent) => {
    let sentiment = 'neutral';
    
    if (event.isReleased && event.postReleaseSentiment) {
      sentiment = event.postReleaseSentiment;
    } else if (event.preReleaseSentiment) {
      sentiment = event.preReleaseSentiment;
    } else if (event.expertSentiment) {
      sentiment = event.expertSentiment;
    }
    
    if (sentiment === 'bullish') {
      return { 
        sentiment: 'Bullish', 
        icon: <TrendingUp className="w-3 h-3 text-green-500" />
      };
    } else if (sentiment === 'bearish') {
      return { 
        sentiment: 'Bearish', 
        icon: <TrendingDown className="w-3 h-3 text-red-500" />
      };
    }
    return { 
      sentiment: 'Neutral', 
      icon: <Minus className="w-3 h-3 text-muted-foreground/50" />
    };
  };

  if (isLoading) {
    return (
      <Card data-testid="card-economic-calendar">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Calendar className="w-5 h-5" />
            Economic Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">Loading events...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-economic-calendar">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Calendar className="w-5 h-5" />
          Economic Calendar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No upcoming events</p>
          ) : (
            Object.entries(groupedEvents).map(([dateKey, dateEvents]) => {
              const date = new Date(dateKey);
              const isToday = format(new Date(), 'yyyy-MM-dd') === dateKey;
              const isTomorrow = format(new Date(Date.now() + 86400000), 'yyyy-MM-dd') === dateKey;
              
              return (
                <div key={dateKey} className="space-y-3">
                  <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10 pb-2 pt-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold">
                        {isToday ? 'Today' : isTomorrow ? 'Tomorrow' : format(date, 'EEE, MMM d')}
                      </div>
                      <div className="h-px flex-1 bg-border"></div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {dateEvents.map((event) => {
                      const sentiment = getMarketSentiment(event);
                      const eventTime = new Date(event.eventTime);
                      
                      return (
                        <div
                          key={event.id}
                          onClick={() => handleEventClick(event.id)}
                          className="group p-3 rounded-md border border-border hover-elevate active-elevate-2 transition-all cursor-pointer"
                          data-testid={`card-event-${event.id}`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge 
                                variant="secondary"
                                className="text-xs font-medium shrink-0"
                              >
                                {event.currency || event.countryCode}
                              </Badge>
                              <span className="text-xs font-mono text-muted-foreground shrink-0" data-testid={`text-time-${event.id}`}>
                                {format(eventTime, 'HH:mm')}
                              </span>
                              {event.impactLevel?.toLowerCase() === 'high' && (
                                <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {sentiment.icon}
                              <Badge 
                                variant={getImpactVariant(event.impactLevel)}
                                className="text-xs"
                              >
                                {event.impactLevel?.toUpperCase() || 'MEDIUM'}
                              </Badge>
                            </div>
                          </div>
                          
                          <div className="mb-2">
                            <h4 className="font-medium text-sm leading-snug group-hover:text-foreground transition-colors" data-testid={`text-event-${event.id}`}>
                              {event.title}
                            </h4>
                          </div>
                          
                          {(event.expectedValue || event.previousValue) && (
                            <div className="flex items-center gap-3 text-xs mb-1.5">
                              {event.previousValue && (
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Prev:</span>
                                  <span className="font-mono font-medium" data-testid={`text-previous-${event.id}`}>
                                    {event.previousValue}
                                  </span>
                                </div>
                              )}
                              {event.expectedValue && (
                                <div className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Fcst:</span>
                                  <span className="font-mono font-medium" data-testid={`text-forecast-${event.id}`}>
                                    {event.expectedValue}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between text-xs">
                            <div className={`font-medium ${
                              sentiment.sentiment === 'Bullish' ? 'text-green-500' : 
                              sentiment.sentiment === 'Bearish' ? 'text-red-500' : 'text-muted-foreground'
                            }`}>
                              {sentiment.sentiment}
                            </div>
                            {event.actualValue && (
                              <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
                                Released: {event.actualValue}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
      
      <EventDetailsDialog 
        eventId={selectedEventId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </Card>
  );
}