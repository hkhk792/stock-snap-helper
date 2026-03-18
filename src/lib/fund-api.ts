// 东方财富API接口
const EASTMONEY_BASE_URL = "https://fund.eastmoney.com/api";

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

// 东方财富基金搜索
export async function searchFundsApi(keyword: string): Promise<FundSearchResult[]> {
  if (!keyword.trim()) return [];
  // 东方财富基金搜索接口
  const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearch?m=1&q=${encodeURIComponent(keyword)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  // 适配返回结构
  return (data?.Datas || []).map((item: any) => ({
    code: item.Code,
    name: item.Name,
    type: item.Type,
    spell: item.Spell,
  }));
}

// 东方财富基金估值
export async function getFundEstimate(code: string): Promise<FundEstimate | null> {
  // 东方财富估值接口（示例，实际接口需适配）
  const url = `https://fund.eastmoney.com/api/FundMangerHome?code=${code}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  // 适配返回结构
  return {
    code,
    name: data?.name || '',
    lastNav: data?.lastNav || 0,
    lastNavDate: data?.lastNavDate || '',
    estimatedNav: data?.estimatedNav || 0,
    estimatedChange: data?.estimatedChange || 0,
    estimatedTime: data?.estimatedTime || '',
  };
}

// 东方财富基金持仓（示例，实际接口需适配）
export async function getFundHoldings(code: string): Promise<{
  holdings: Array<{ name: string; code?: string; weight: number }>;
  stockCodes: string[];
}> {
  // 东方财富持仓接口
  const url = `https://fund.eastmoney.com/api/FundMangerHome?code=${code}`;
  const res = await fetch(url);
  if (!res.ok) return { holdings: [], stockCodes: [] };
  const data = await res.json();
  // 适配返回结构
  const holdings = (data?.holdings || []).map((item: any) => ({
    name: item.Name,
    code: item.Code,
    weight: item.Weight,
  }));
  const stockCodes = holdings.map((h: any) => h.code).filter(Boolean);
  return { holdings, stockCodes };
}

// 东方财富股票行情（示例，实际接口需适配）
export async function getStockQuotes(codes: string[]): Promise<StockQuote[]> {
  if (codes.length === 0) return [];
  // 东方财富股票行情接口
  const url = `https://quote.eastmoney.com/api/StockQuote?codes=${codes.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.quotes || []).map((item: any) => ({
    code: item.Code,
    name: item.Name,
    price: item.Price,
    changePercent: item.ChangePercent,
  }));
}

// 东方财富大盘指数（示例，实际接口需适配）
export async function getGlobalIndices(): Promise<StockQuote[]> {
  // 东方财富大盘指数接口
  const url = `https://quote.eastmoney.com/api/IndexQuote?codes=000001,399001,399006`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.indices || []).map((item: any) => ({
    code: item.Code,
    name: item.Name,
    price: item.Price,
    changePercent: item.ChangePercent,
  }));
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
