// 后端 API 地址
const BACKEND_URL = "https://stock-snap-helper.onrender.com";

// Edge Function fallback
function getEdgeFunctionUrl() {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'pxkutqxlhtnjcywwtble';
  return `https://${projectId}.supabase.co/functions/v1/fund-api`;
}

// 本地缓存
const cache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_DURATION = 60 * 1000; // 1分钟缓存

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

function getCachedData(key: string) {
  const cached = cache[key];
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

function setCachedData(key: string, data: any) {
  cache[key] = { data, timestamp: Date.now() };
}

// 带超时的 fetch
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// 调用 Edge Function
async function callEdgeFunction(action: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(getEdgeFunctionUrl());
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4a3V0cXhsaHRuamN5d3d0YmxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzM1MTcsImV4cCI6MjA4OTE0OTUxN30.ILKOFXaIjaLpKrwoBiUIpheIDX2LSqyR23kKINGXbRk';
  const res = await fetchWithTimeout(url.toString(), {
    headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
  }, 15000);
  if (!res.ok) throw new Error(`Edge function returned ${res.status}`);
  return res.json();
}

// 先尝试后端，失败则用 Edge Function
async function fetchWithFallback(
  backendPath: string,
  edgeAction: string,
  edgeParams: Record<string, string> = {},
): Promise<any> {
  try {
    const res = await fetchWithTimeout(`${BACKEND_URL}${backendPath}`);
    if (res.ok) return res.json();
  } catch {
    // backend unavailable, fall through
  }
  return callEdgeFunction(edgeAction, edgeParams);
}

// 基金搜索
export async function searchFundsApi(keyword: string): Promise<FundSearchResult[]> {
  if (!keyword.trim()) return [];
  const cacheKey = `search_${keyword}`;
  const cachedData = getCachedData(cacheKey);
  if (cachedData) return cachedData;

  try {
    const data = await fetchWithFallback(
      `/api/fund/search?keyword=${encodeURIComponent(keyword)}`,
      'search',
      { keyword },
    );
    const result = (data || []).map((item: any) => ({
      code: item.code,
      name: item.name,
      type: item.type || '未知',
      spell: item.spell,
    }));
    setCachedData(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Fund search error:', error);
    return [];
  }
}

// 基金估值
export async function getFundEstimate(code: string): Promise<FundEstimate | null> {
  const cacheKey = `estimate_${code}`;
  const cachedData = getCachedData(cacheKey);
  if (cachedData) return cachedData;

  try {
    const data = await fetchWithFallback(
      `/api/fund/estimate?code=${code}`,
      'estimate',
      { code },
    );
    if (!data) return null;
    const result: FundEstimate = {
      code: data.code,
      name: data.name,
      lastNav: data.lastNav,
      lastNavDate: data.lastNavDate,
      estimatedNav: data.estimatedNav,
      estimatedChange: data.estimatedChange,
      estimatedTime: data.estimatedTime,
    };
    setCachedData(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Estimate API error:', error);
    return null;
  }
}

// 基金持仓
export async function getFundHoldings(code: string): Promise<{
  holdings: Array<{ name: string; code?: string; weight: number }>;
  stockCodes: string[];
}> {
  const cacheKey = `holdings_${code}`;
  const cachedData = getCachedData(cacheKey);
  if (cachedData) return cachedData;

  try {
    const data = await fetchWithFallback(
      `/api/fund/holdings?code=${code}`,
      'holdings',
      { code },
    );
    const result = {
      holdings: data?.holdings || [],
      stockCodes: data?.stockCodes || [],
    };
    setCachedData(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Holdings API error:', error);
    return { holdings: [], stockCodes: [] };
  }
}

// 股票行情
export async function getStockQuotes(codes: string[]): Promise<StockQuote[]> {
  if (codes.length === 0) return [];
  const codesStr = codes.join(',');
  const cacheKey = `quotes_${codesStr}`;
  const cachedData = getCachedData(cacheKey);
  if (cachedData) return cachedData;

  try {
    const data = await fetchWithFallback(
      `/api/quotes?codes=${codesStr}`,
      'stock_quotes',
      { codes: codesStr },
    );
    const quotes = (data || []).map((item: any) => ({
      code: item.code,
      name: item.name,
      price: item.price,
      changePercent: item.changePercent,
    }));
    setCachedData(cacheKey, quotes);
    return quotes;
  } catch (error) {
    console.error('Stock quotes API error:', error);
    return [];
  }
}

// 全球指数
export async function getGlobalIndices(): Promise<StockQuote[]> {
  const cacheKey = 'global_indices';
  const cachedData = getCachedData(cacheKey);
  if (cachedData) return cachedData;

  try {
    const data = await fetchWithFallback(
      '/api/indices',
      'indices',
    );
    const indices = (data || []).map((item: any) => ({
      code: item.code,
      name: item.name,
      price: item.price,
      changePercent: item.changePercent,
    }));
    setCachedData(cacheKey, indices);
    return indices;
  } catch (error) {
    console.error('Indices API error:', error);
    return [];
  }
}
