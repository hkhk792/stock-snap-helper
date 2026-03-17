import { BACKEND_BASE_URL, backendQuotes } from "@/lib/backend-api";

export interface FundSearchResult {
  code: string;
  name: string;
  type: string;
  spell?: string;
}

export interface FundEstimate {
  code: string;
  name: string;
  lastNav: number;
  lastNavDate: string;
  estimatedNav: number;
  estimatedChange: number;
  estimatedTime: string;
}

export interface StockQuote {
  code: string;
  name: string;
  price: number;
  changePercent: number;
}

async function callFundApi(params: Record<string, string>) {
  // Prefer Python backend if configured; fall back to Supabase Edge Function.
  const backendEnabled = true;

  if (backendEnabled) {
    const action = params.action;
    if (action === "search") {
      const url = new URL(`${BACKEND_BASE_URL}/api/fund/search`);
      url.searchParams.set("keyword", params.keyword || "");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
    if (action === "estimate") {
      const url = new URL(`${BACKEND_BASE_URL}/api/fund/estimate`);
      url.searchParams.set("code", params.code || "");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
    if (action === "holdings") {
      const url = new URL(`${BACKEND_BASE_URL}/api/fund/holdings`);
      url.searchParams.set("code", params.code || "");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
    if (action === "stock_quotes") {
      const codes = (params.codes || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return backendQuotes(codes);
    }
  }

  const searchParams = new URLSearchParams(params);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const url = `${supabaseUrl}/functions/v1/fund-api?${searchParams.toString()}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json();
}

export async function searchFundsApi(keyword: string): Promise<FundSearchResult[]> {
  if (!keyword.trim()) return [];
  return callFundApi({ action: 'search', keyword });
}

export async function getFundEstimate(code: string): Promise<FundEstimate | null> {
  return callFundApi({ action: 'estimate', code });
}

export async function getFundHoldings(code: string): Promise<{
  holdings: Array<{ name: string; code?: string; weight: number }>;
  stockCodes: string[];
}> {
  return callFundApi({ action: 'holdings', code });
}

export async function getStockQuotes(codes: string[]): Promise<StockQuote[]> {
  if (codes.length === 0) return [];
  return callFundApi({ action: 'stock_quotes', codes: codes.join(',') });
}

export async function getGlobalIndices(): Promise<StockQuote[]> {
  return callFundApi({ action: 'indices' });
}
