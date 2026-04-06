import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HomePage from "@/pages/HomePage";
import Dashboard from "@/pages/Dashboard";
import TradeHistoryPage from "@/pages/TradeHistoryPage";
import Analytics from "@/pages/Analytics";
import EconomicCalendar from "@/pages/EconomicCalendar";
import Stocks from "@/pages/Stocks";
import MajorPairs from "@/pages/MajorPairs";
import Commodities from "@/pages/Commodities";
import Cryptocurrency from "@/pages/Cryptocurrency";
import Join from "@/pages/Join";
import Blog from "@/pages/Blog";
import Journal from "@/pages/Journal";
// import AssetPage from "@/pages/AssetPage";  // DISABLED — re-enable when ready
function AssetComingSoon() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "#080c10", gap: 16, padding: "0 24px",
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: "50%",
        border: "2px solid #22d3a5",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28, color: "#22d3a5",
        boxShadow: "0 0 24px rgba(34,211,165,0.2)",
      }}>◈</div>
      <h1 style={{
        color: "#c8d8e8", fontFamily: "'Montserrat', sans-serif",
        fontSize: 28, fontWeight: 700, letterSpacing: "0.08em",
        margin: 0, textAlign: "center",
      }}>ASSETS PANEL</h1>
      <p style={{
        color: "#22d3a5", fontFamily: "'Montserrat', sans-serif",
        fontSize: 13, fontWeight: 600, letterSpacing: "0.2em",
        margin: 0, textTransform: "uppercase",
      }}>Coming Soon</p>
      <p style={{
        color: "#4a6580", fontFamily: "'Montserrat', sans-serif",
        fontSize: 12, textAlign: "center", maxWidth: 340, margin: 0,
      }}>
        This section is currently under maintenance. Check back shortly.
      </p>
    </div>
  );
}
import TscPage from "@/pages/TscPage";
import BlogPage from "@/pages/BlogPage";
import EconomicCalendarPage from "@/pages/EconomicCalendarPage";
import NotFound from "@/pages/not-found";

function InnerPages() {
  return (
    <div className="flex flex-col min-h-screen w-full">
      <Header />
      <main className="flex-1 bg-background">
        <Switch>
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/history" component={TradeHistoryPage} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/calendar" component={EconomicCalendar} />
          <Route path="/stocks" component={Stocks} />
          <Route path="/major-pairs" component={MajorPairs} />
          <Route path="/commodities" component={Commodities} />
          <Route path="/crypto" component={Cryptocurrency} />
          <Route path="/join" component={Join} />
          <Route path="/blog" component={Blog} />
          <Route path="/markets" component={Stocks} />
          <Route path="/signals" component={Stocks} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/tsc" component={TscPage} />
          <Route path="/blog" component={BlogPage} />
          <Route path="/calendar" component={EconomicCalendarPage} />
          <Route path="/journal" component={Journal} />
          <Route path="/assets" component={AssetComingSoon} />{/* swap AssetComingSoon → AssetPage to re-enable */}
          <Route>{() => <InnerPages />}</Route>
        </Switch>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}