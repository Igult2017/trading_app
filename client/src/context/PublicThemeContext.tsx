import { createContext, useContext } from "react";

interface PublicThemeContextValue {
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
}

export const PublicThemeContext = createContext<PublicThemeContextValue>({
  darkMode: false,
  setDarkMode: () => {},
});

export function usePublicTheme() {
  return useContext(PublicThemeContext);
}
