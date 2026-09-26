import { createRoot } from "react-dom/client";
import { initThemeMode } from "@/lib/appTheme";
import { HelmetProvider } from "react-helmet-async";
import { I18nextProvider } from "react-i18next";
import { LanguageProvider } from "./context/LanguageContext";
import i18n from "./i18n/index";
import App from "./App";
import "./index.css";

// BEFORE THE FIRST PAINT, or a light-theme user meets a dark flash on every load. See lib/appTheme.
initThemeMode();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <I18nextProvider i18n={i18n}>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </I18nextProvider>
  </HelmetProvider>
);
