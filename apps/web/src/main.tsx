import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// The round-2 theme candidates ride along in development only (src/dev/theme-switcher.tsx).
if (import.meta.env.DEV) void import("./dev/theme-candidates.css");

// A list re-read within five seconds of the last read is the same list: the
// live stream invalidates what an Event changed, so a mounted screen never
// needs to refetch merely because a component remounted (lib/live.ts).
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 5_000 } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* `.dark` on <html>: the theme is a class the toggle sets, defaulting to the OS (index.css). */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
