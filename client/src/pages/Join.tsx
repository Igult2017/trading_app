import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Zap, Shield, BarChart3, Bell } from 'lucide-react';

export default function Join() {
  const features = [
    { icon: Zap, text: 'Real-time trading signals across Forex, Stocks, Crypto & Commodities' },
    { icon: BarChart3, text: 'Smart Money Concepts analysis with institutional methodology' },
    { icon: Bell, text: 'Telegram notifications for new signals and economic events' },
    { icon: Shield, text: 'Multi-timeframe confirmation for higher accuracy' },
  ];

  return (
    <div className="min-h-screen bg-[#f7f7f7] dark:bg-background text-gray-800 dark:text-foreground p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight mb-4">
            Join <span className="text-bull-green">Find</span>Buy<span className="text-bear-red">Sell</span>Zones
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Get access to professional-grade trading signals powered by Smart Money Concepts
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <Card className="border-2 border-border">
            <CardHeader>
              <CardTitle className="text-2xl">Free Plan</CardTitle>
              <CardDescription>Get started with basic signals</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-extrabold mb-6">$0<span className="text-lg font-normal text-muted-foreground">/month</span></div>
              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-bull-green" />
                  <span>5 signals per day</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-bull-green" />
                  <span>Major forex pairs</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-bull-green" />
                  <span>Economic calendar</span>
                </li>
              </ul>
              <Button className="w-full" variant="outline" data-testid="button-free-signup">
                Get Started Free
              </Button>
            </CardContent>
          </Card>

          <Card className="border-2 border-primary relative overflow-visible">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-sm font-bold rounded-full">
              POPULAR
            </div>
            <CardHeader>
              <CardTitle className="text-2xl">Pro Plan</CardTitle>
              <CardDescription>Full access to all features</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-extrabold mb-6">$29<span className="text-lg font-normal text-muted-foreground">/month</span></div>
              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-bull-green" />
                  <span>Unlimited signals</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-bull-green" />
                  <span>All asset classes</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-bull-green" />
                  <span>Telegram notifications</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-bull-green" />
                  <span>Priority support</span>
                </li>
              </ul>
              <Button className="w-full" data-testid="button-pro-signup">
                Start Pro Trial
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="bg-white dark:bg-background border-2 border-border rounded-lg p-8">
          <h2 className="text-2xl font-bold mb-6 text-center">Why Choose Us?</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature, index) => (
              <div key={index} className="flex items-start gap-4">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <p className="text-muted-foreground">{feature.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
