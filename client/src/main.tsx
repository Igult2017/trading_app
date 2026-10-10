import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { I18nextProvider } from "react-i18next";
import { LanguageProvider } from "./context/LanguageContext";
import i18n from "./i18n/index";
import App from "./App";
import { watchForNewBuild } from "./lib/buildVersion";
import "./index.css";

// Reload once when a newer build is deployed. An already-open tab otherwise runs old code for ever,
// and keeps working while it does — see client/src/lib/buildVersion.ts.
watchForNewBuild();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <I18nextProvider i18n={i18n}>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </I18nextProvider>
  </HelmetProvider>
);
