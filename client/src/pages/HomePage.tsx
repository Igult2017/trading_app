import { usePublicTheme } from "@/context/PublicThemeContext";
import HomeHeader from "@/components/HomeHeader";
import HomeFooter from "@/components/HomeFooter";
import HeroSection from "@/components/home/HeroSection";
import FeaturesSection from "@/components/home/FeaturesSection";
import DemoSection from "@/components/home/DemoSection";
import AiSection from "@/components/home/AiSection";
import PricingSection from "@/components/home/PricingSection";
import TestimonialsSection from "@/components/home/TestimonialsSection";
import SignalScannerSection from "@/components/home/SignalScannerSection";
import CtaSection from "@/components/home/CtaSection";

export default function HomePage() {
  const { darkMode, setDarkMode } = usePublicTheme();

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden">
      <HomeHeader darkMode={darkMode} setDarkMode={setDarkMode} activePath="/" />
      <HeroSection />
      <FeaturesSection />
      <DemoSection />
      <AiSection />
      <SignalScannerSection />
      <PricingSection />
      <TestimonialsSection />
      <CtaSection />
      <HomeFooter darkMode={darkMode} />
    </div>
  );
}
