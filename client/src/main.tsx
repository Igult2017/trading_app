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

// Take down the pre-React placeholder in index.html the moment the real page exists. It is
// `position: fixed` over everything, so leaving it would hide the app entirely — removing it here,
// immediately before the first render, is what makes it a placeholder rather than a cover.
document.getElementById("boot-skeleton")?.remove();
// ⚠ AND THE JOURNAL ONE. Both are `position: fixed` over everything, so a placeholder left
// behind does not look like a slow load — it covers the whole app permanently. Adding the
// journal outline (index.html, 2026-10-13) without this line would have hidden the journal.
document.getElementById("boot-journal")?.remove();
// ...and drop the class the head script set. While it is on <html> a rule in index.html
// forces the body background, which would fight the journal if the theme were switched
// without a reload. Removed here, one line before the first render, so nothing paints
// between the two.
const bootCls = document.documentElement.className.split(" ");
document.documentElement.className = bootCls
  .filter((c) => c !== "boot-journal-route" && !c.startsWith("boot-theme-"))
  .join(" ")
  .trim();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <I18nextProvider i18n={i18n}>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </I18nextProvider>
  </HelmetProvider>
);
