import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, TrendingUp, TrendingDown, Minus, Clock, AlertTriangle, DollarSign, BarChart3 } from 'lucide-react';
import { format } from 'date-fns';
import type { EconomicEvent } from '@shared/schema';
import EventDetailsDialog from '@/components/EventDetailsDialog';

export default function EconomicCalendar() {
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [impactFilter, setImpactFilter] = useState<string>('all');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: events = [], isLoading } = useQuery<EconomicEvent[]>({
    queryKey: ['/api/economic-events', regionFilter, impactFilter, currencyFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (regionFilter !== 'all') params.append('region', regionFilter);
      if (impactFilter !== 'all') params.append('impactLevel', impactFilter);
      if (currencyFilter !== 'all') params.append('currency', currencyFilter);
      
      const response = await fetch(`/api/economic-events?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch events');
      return response.json();
    },
  });

  const upcomingEvents = events.filter(e => !e.isReleased && new Date(e.eventTime) > new Date());
  const recentEvents = events.filter(e => e.isReleased);

  const getImpactColor = (level: string) => {
    return level === 'HIGH' ? 'hsl(0 84% 60%)' : 'hsl(38 92% 50%)';
  };

  const getImpactIcon = (level: string) => {
    return level === 'HIGH' ? <AlertTriangle className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />;
  };

  const calculateSurprise = (expected: string | null, actual: string | null) => {
    if (!expected || !actual) return null;
    const exp = parseFloat(expected);
    const act = parseFloat(actual);
    if (isNaN(exp) || isNaN(act)) return null;
    const diff = act - exp;
    return diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2);
  };

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

  const handleEventClick = (eventId: string) => {
    setSelectedEventId(eventId);
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setSelectedEventId(null);
    }
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Economic Calendar</h1>
          <p className="text-muted-foreground">Track high-impact economic events and market-moving data releases</p>
        </div>
      </div>

      <Card data-testid="card-filters">
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Region</label>
              <Select value={regionFilter} onValueChange={setRegionFilter}>
                <SelectTrigger data-testid="select-region">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  <SelectItem value="NA">North America</SelectItem>
                  <SelectItem value="EU">Europe</SelectItem>
                  <SelectItem value="ASIA">Asia</SelectItem>
                  <SelectItem value="OCEANIA">Oceania</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Impact Level</label>
              <Select value={impactFilter} onValueChange={setImpactFilter}>
                <SelectTrigger data-testid="select-impact">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="HIGH">High Impact</SelectItem>
                  <SelectItem value="MEDIUM">Medium Impact</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Currency</label>
              <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
                <SelectTrigger data-testid="select-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Currencies</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="JPY">JPY</SelectItem>
                  <SelectItem value="AUD">AUD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Loading events...</p>
          </CardContent>
        </Card>
      ) : events.length === 0 ? (
        <Card data-testid="card-empty">
          <CardContent className="p-12 text-center space-y-4">
            <Calendar className="w-12 h-12 mx-auto text-muted-foreground" />
            <div>
              <h3 className="text-lg font-medium">No Events Found</h3>
              <p className="text-sm text-muted-foreground">
                No economic events match your current filters
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {upcomingEvents.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Upcoming Events
              </h2>
              <div className="grid gap-4">
                {upcomingEvents.map((event) => {
                  const sentiment = getMarketSentiment(event);
                  return (
                  <Card 
                    key={event.id} 
                    className="hover-elevate active-elevate-2 cursor-pointer" 
                    onClick={() => handleEventClick(event.id)}
                    data-testid={`card-event-${event.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="default"
                              style={{ backgroundColor: getImpactColor(event.impactLevel) }}
                              className="text-xs"
                              data-testid={`badge-impact-${event.id}`}
                            >
                              {getImpactIcon(event.impactLevel)}
                              <span className="ml-1">{event.impactLevel} IMPACT</span>
                            </Badge>
                            <Badge variant="secondary" className="text-xs" data-testid={`badge-currency-${event.id}`}>
                              {event.currency}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {event.country}
                            </Badge>
                            <div className="flex items-center gap-1">
                              {sentiment.icon}
                              <span className={`text-xs font-medium ${
                                sentiment.sentiment === 'Bullish' ? 'text-green-500' : 
                                sentiment.sentiment === 'Bearish' ? 'text-red-500' : 'text-muted-foreground'
                              }`}>
                                {sentiment.sentiment}
                              </span>
                            </div>
                          </div>

                          <div>
                            <h3 className="font-semibold text-lg" data-testid={`text-title-${event.id}`}>{event.title}</h3>
                            {event.description && (
                              <p className="text-sm text-muted-foreground">{event.description}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="w-4 h-4" />
                              <span data-testid={`text-time-${event.id}`}>
                                {format(new Date(event.eventTime), 'MMM dd, yyyy HH:mm')} UTC
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <BarChart3 className="w-4 h-4" />
                              <span>{event.eventType}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t">
                            {event.previousValue && (
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Previous</p>
                                <p className="font-medium" data-testid={`text-previous-${event.id}`}>
                                  {event.previousValue} {event.unit}
                                </p>
                              </div>
                            )}
                            {event.expectedValue && (
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Expected</p>
                                <p className="font-medium" data-testid={`text-expected-${event.id}`}>
                                  {event.expectedValue} {event.unit}
                                </p>
                              </div>
                            )}
                            {event.futuresImpliedExpectation && (
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">Futures Implied</p>
                                <p className="font-medium text-primary">
                                  {event.futuresImpliedExpectation} {event.unit}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  )
                })}
              </div>
            </div>
          )}

          {recentEvents.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Released Events
              </h2>
              <div className="grid gap-4">
                {recentEvents.map((event) => {
                  const surprise = calculateSurprise(event.expectedValue, event.actualValue);
                  const sentiment = getMarketSentiment(event);
                  return (
                    <Card 
                      key={event.id} 
                      className="hover-elevate active-elevate-2 cursor-pointer" 
                      onClick={() => handleEventClick(event.id)}
                      data-testid={`card-released-${event.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant="default"
                                style={{ backgroundColor: getImpactColor(event.impactLevel) }}
                                className="text-xs"
                              >
                                {getImpactIcon(event.impactLevel)}
                                <span className="ml-1">{event.impactLevel} IMPACT</span>
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {event.currency}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {event.country}
                              </Badge>
                              <Badge variant="default" className="text-xs bg-green-600">
                                RELEASED
                              </Badge>
                              <div className="flex items-center gap-1">
                                {sentiment.icon}
                                <span className={`text-xs font-medium ${
                                  sentiment.sentiment === 'Bullish' ? 'text-green-500' : 
                                  sentiment.sentiment === 'Bearish' ? 'text-red-500' : 'text-muted-foreground'
                                }`}>
                                  {sentiment.sentiment}
                                </span>
                              </div>
                            </div>

                            <div>
                              <h3 className="font-semibold text-lg">{event.title}</h3>
                              {event.description && (
                                <p className="text-sm text-muted-foreground">{event.description}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="w-4 h-4" />
                                <span>
                                  {format(new Date(event.eventTime), 'MMM dd, yyyy HH:mm')} UTC
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
                              {event.previousValue && (
                                <div className="space-y-1">
                                  <p className="text-xs text-muted-foreground">Previous</p>
                                  <p className="font-medium">
                                    {event.previousValue} {event.unit}
                                  </p>
                                </div>
                              )}
                              {event.expectedValue && (
                                <div className="space-y-1">
                                  <p className="text-xs text-muted-foreground">Expected</p>
                                  <p className="font-medium">
                                    {event.expectedValue} {event.unit}
                                  </p>
                                </div>
                              )}
                              {event.actualValue && (
                                <div className="space-y-1">
                                  <p className="text-xs text-muted-foreground">Actual</p>
                                  <p className="font-medium text-primary" data-testid={`text-actual-${event.id}`}>
                                    {event.actualValue} {event.unit}
                                  </p>
                                </div>
                              )}
                              {surprise && (
                                <div className="space-y-1">
                                  <p className="text-xs text-muted-foreground">Surprise</p>
                                  <p className={`font-medium ${parseFloat(surprise) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {surprise} {event.unit}
                                  </p>
                                </div>
                              )}
                            </div>

                            {event.marketImpactAnalysis && (
                              <div className="pt-2 border-t">
                                <p className="text-xs text-muted-foreground mb-1">Market Impact Analysis</p>
                                <p className="text-sm">{event.marketImpactAnalysis}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
      
      <EventDetailsDialog 
        eventId={selectedEventId}
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
      />
    </div>
  );
}
