import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import Header from "@/components/Header";
import Dashboard from "@/pages/Dashboard";
import TradeHistoryPage from "@/pages/TradeHistoryPage";
import Analytics from "@/pages/Analytics";
import EconomicCalendar from "@/pages/EconomicCalendar";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/history" component={TradeHistoryPage} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/calendar" component={EconomicCalendar} />
      {/* TODO: Add other trading pages */}
      {/* <Route path="/markets" component={Markets} /> */}
      {/* <Route path="/signals" component={Signals} /> */}
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  // Custom sidebar width for trading application
  const style = {
    "--sidebar-width": "18rem",       // 288px for trading navigation
    "--sidebar-width-icon": "4rem",   // default icon width
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar />
            <div className="flex flex-col flex-1 w-full">
              <Header />
              <main className="flex-1 overflow-auto bg-background">
                <Router />
              </main>
            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
