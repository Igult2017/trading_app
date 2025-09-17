import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

interface EconomicEvent {
  id: string;
  time: string;
  currency: string;
  event: string;
  impact: 'high' | 'medium' | 'low';
  forecast: string;
  previous: string;
  projected: 'positive' | 'negative' | 'neutral';
}

export default function EconomicCalendar() {
  // TODO: Remove mock data - replace with real economic calendar data
  const events: EconomicEvent[] = [
    {
      id: '1',
      time: '14:30',
      currency: 'USD',
      event: 'Non-Farm Payrolls',
      impact: 'high',
      forecast: '185K',
      previous: '199K',
      projected: 'negative'
    },
    {
      id: '2',
      time: '16:00',
      currency: 'USD',
      event: 'ISM Services PMI',
      impact: 'medium',
      forecast: '52.8',
      previous: '52.6',
      projected: 'positive'
    },
    {
      id: '3',
      time: '09:30',
      currency: 'GBP',
      event: 'GDP Growth Rate',
      impact: 'high',
      forecast: '0.3%',
      previous: '0.1%',
      projected: 'positive'
    },
    {
      id: '4',
      time: '12:00',
      currency: 'EUR',
      event: 'ECB Interest Rate Decision',
      impact: 'high',
      forecast: '4.50%',
      previous: '4.50%',
      projected: 'neutral'
    },
    {
      id: '5',
      time: '15:45',
      currency: 'USD',
      event: 'Core CPI',
      impact: 'high',
      forecast: '3.2%',
      previous: '3.3%',
      projected: 'positive'
    }
  ];

  const getImpactColor = (impact: string) => {
    switch(impact) {
      case 'high': return 'hsl(0 75% 60%)';
      case 'medium': return 'hsl(45 90% 60%)';
      case 'low': return 'hsl(120 60% 50%)';
      default: return '';
    }
  };

  const getProjectedIcon = (projected: string) => {
    switch(projected) {
      case 'positive': return <TrendingUp className="w-3 h-3 text-green-500" />;
      case 'negative': return <TrendingDown className="w-3 h-3 text-red-500" />;
      default: return <div className="w-3 h-3 rounded-full bg-muted-foreground/50" />;
    }
  };

  return (
    <Card data-testid="card-economic-calendar">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Calendar className="w-5 h-5" />
          Economic Calendar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {events.map((event) => (
            <div
              key={event.id}
              className="p-3 rounded-md border border-border hover-elevate transition-colors"
              data-testid={`card-event-${event.id}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="secondary"
                    className="text-xs font-medium"
                    style={{ backgroundColor: getImpactColor(event.impact) + '20', color: getImpactColor(event.impact) }}
                  >
                    {event.currency}
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground" data-testid={`text-time-${event.id}`}>
                    {event.time}
                  </span>
                  {event.impact === 'high' && (
                    <AlertTriangle className="w-3 h-3 text-red-500" />
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {getProjectedIcon(event.projected)}
                  <Badge 
                    variant="outline"
                    className="text-xs"
                    style={{ borderColor: getImpactColor(event.impact), color: getImpactColor(event.impact) }}
                  >
                    {event.impact.toUpperCase()}
                  </Badge>
                </div>
              </div>
              
              <div className="mb-2">
                <h4 className="font-medium text-sm" data-testid={`text-event-${event.id}`}>
                  {event.event}
                </h4>
              </div>
              
              <div className="flex items-center justify-between text-xs">
                <div className="flex gap-4">
                  <div>
                    <span className="text-muted-foreground">Forecast: </span>
                    <span className="font-mono font-medium" data-testid={`text-forecast-${event.id}`}>
                      {event.forecast}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Previous: </span>
                    <span className="font-mono font-medium" data-testid={`text-previous-${event.id}`}>
                      {event.previous}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-medium ${
                    event.projected === 'positive' ? 'text-green-500' : 
                    event.projected === 'negative' ? 'text-red-500' : 'text-muted-foreground'
                  }`}>
                    {event.projected === 'positive' ? 'Bullish' : 
                     event.projected === 'negative' ? 'Bearish' : 'Neutral'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}