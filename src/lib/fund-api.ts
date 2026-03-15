import { supabase } from "@/integrations/supabase/client";

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
  const searchParams = new URLSearchParams(params);
  const { data, error } = await supabase.functions.invoke('fund-api', {
    body: null,
    headers: { 'Content-Type': 'application/json' },
    method: 'GET',
  });

  // supabase.functions.invoke doesn't support query params well, use fetch directly
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/fund-api?${searchParams.toString()}`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
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
