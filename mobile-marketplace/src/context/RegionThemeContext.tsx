import React, { createContext, useContext, useEffect, useState } from "react";
import { getTheme, resolveRegion, ResolvedRegion, ResolvedTheme } from "../api/region";
import { DEFAULT_THEME } from "../theme/default";

interface RegionThemeContextValue {
  region: ResolvedRegion | null;
  theme: ResolvedTheme;
  loading: boolean;
}

const RegionThemeContext = createContext<RegionThemeContextValue>({
  region: null,
  theme: DEFAULT_THEME,
  loading: true,
});

export function RegionThemeProvider({ children }: { children: React.ReactNode }) {
  const [region, setRegion] = useState<ResolvedRegion | null>(null);
  const [theme, setTheme] = useState<ResolvedTheme>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const resolvedRegion = await resolveRegion();
        setRegion(resolvedRegion);
        const resolvedTheme = await getTheme(resolvedRegion.themeKey);
        setTheme(resolvedTheme);
      } catch {
        // Region-resolution route isn't built yet -- fall back to the
        // default theme so the app shell still renders during development.
        setTheme(DEFAULT_THEME);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <RegionThemeContext.Provider value={{ region, theme, loading }}>
      {children}
    </RegionThemeContext.Provider>
  );
}

export function useRegionTheme(): RegionThemeContextValue {
  return useContext(RegionThemeContext);
}
