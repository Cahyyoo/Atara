"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Theme } from "@/lib/theme";

/**
 * Which theme the page is currently in, for the few things that cannot read it
 * from CSS.
 *
 * Almost everything follows the `.dark` class on <html> without help. The
 * exception is the canvas: Chart.js paints with real colour strings, so the
 * charts have to be told when the tokens underneath them changed and re-read
 * them. Without this they would keep painting light-mode axes and gridlines on
 * a dark card — which is the failure `readChartChrome` has warned about in a
 * comment since the day it was written.
 *
 * Fed from the server layout, so after `router.refresh()` the new value
 * arrives as a prop and everything downstream re-renders with it.
 */
const ThemeContext = createContext<Theme>("light");

export function ThemeProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
