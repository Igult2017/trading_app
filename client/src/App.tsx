import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Header from "@/components/Header";
import Dashboard from "@/pages/Dashboard";
import TradeHistoryPage from "@/pages/TradeHistoryPage";
import Analytics from "@/pages/Analytics";
import EconomicCalendar from "@/pages/EconomicCalendar";
import Stocks from "@/pages/Stocks";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/history" component={TradeHistoryPage} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/calendar" component={EconomicCalendar} />
      <Route path="/stocks" component={Stocks} />
      <Route path="/markets" component={Stocks} />
      <Route path="/signals" component={Stocks} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex flex-col h-screen w-full">
          <Header />
          <main className="flex-1 overflow-auto bg-background">
            <Router />
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
