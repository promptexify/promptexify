"use client";

import { createContext, useContext } from "react";

// ---------------------------------------------------------------------------
// CSRF token context
//
// The token value is injected server-side by app/layout.tsx, which reads the
// x-csrf-token-value request header stamped by the middleware. This eliminates
// the GET /api/v1/csrf round-trip that would otherwise block form renders.
// ---------------------------------------------------------------------------

const CsrfContext = createContext<string | null>(null);

export function CsrfClientProvider({
  token,
  children,
}: {
  token: string | null;
  children: React.ReactNode;
}) {
  return (
    <CsrfContext.Provider value={token}>{children}</CsrfContext.Provider>
  );
}

export function useCsrfContext(): string | null {
  return useContext(CsrfContext);
}
