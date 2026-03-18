// 东方财富API接口
const EASTMONEY_BASE_URL = "https://fundsuggest.eastmoney.com";

// Alpha Vantage API
const ALPHA_VANTAGE_API_KEY = "3VPGBLRKXQDJVFRG";
const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";

// 本地缓存
const cache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_DURATION = 60 * 1000; // 1分钟缓存

export interface FundSearchResult {
  code: string;
  name: string;
  type: string;
  spell?: string;
  market?: string; // 市场类型：'cn' 或 'global'
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

// 缓存函数
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

// 调用后端API
async function callFundApi(params: any) {
  // 构建缓存键
  const cacheKey = `${params.action}_${params.keyword || params.code || params.codes || ''}`;
  
  // 检查缓存
  const cachedData = getCachedData(cacheKey);
  if (cachedData) {
    return cachedData;
  }
  
  // 构建API URL
  const url = new URL('https://stock-snap-helper.onrender.com/api/fund');
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  
  try {
    const res = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 3000, // 3秒超时
    });
    
    if (!res.ok) {
      // 回退到东方财富API
      return fallbackApi(params);
    }
    
    const data = await res.json();
    setCachedData(cacheKey, data);
    return data;
  } catch (error) {
    // 网络错误时回退到东方财富API
    return fallbackApi(params);
  }
}

// 回退到东方财富API
async function fallbackApi(params: any) {
  const { action, keyword, code, codes } = params;
  
  if (action === 'search') {
    const url = `${EASTMONEY_BASE_URL}/FundSearch/api/FundSearch?m=1&q=${encodeURIComponent(keyword)}`;
    const res = await fetch(url, { timeout: 3000 });
    if (!res.ok) return [];
    const data = await res.json();
    const result = (data?.Datas || []).map((item: any) => ({
      code: item.CODE || item.Code,
      name: item.NAME || item.Name,
      type: item.FundBaseInfo?.FTYPE || item.CATEGORYDESC || item.Type || '未知',
      spell: item.SPELL || item.Spell,
      market: 'cn', // 标记为国内基金
    }));
    setCachedData(`search_${keyword}`, result);
    return result;
  }
  
  return [];
}

// 使用 Alpha Vantage API 搜索海外基金
async function searchGlobalFunds(keyword: string): Promise<FundSearchResult[]> {
  const cacheKey = `global_search_${keyword}`;
  const cachedData = getCachedData(cacheKey);
  if (cachedData) {
    return cachedData;
  }
  
  try {
    // Alpha Vantage 基金搜索接口
    const url = new URL(ALPHA_VANTAGE_BASE_URL);
    url.searchParams.set('function', 'SYMBOL_SEARCH');
    url.searchParams.set('keywords', keyword);
    url.searchParams.set('apikey', ALPHA_VANTAGE_API_KEY);
    
    const res = await fetch(url.toString(), { timeout: 3000 });
    if (!res.ok) return [];
    
    const data = await res.json();
    const result = (data?.bestMatches || []).map((item: any) => ({
      code: item['1. symbol'],
      name: item['2. name'],
      type: item['3. type'] || '海外基金',
      market: 'global', // 标记为海外基金
    }));
    
    setCachedData(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Alpha Vantage API error:', error);
    return [];
  }
}

// 基金搜索（同时使用国内和海外API）
export async function searchFundsApi(keyword: string): Promise<FundSearchResult[]> {
  if (!keyword.trim()) return [];
  
  // 并行调用两个API
  const [cnFunds, globalFunds] = await Promise.all([
    callFundApi({ action: 'search', keyword }),
    searchGlobalFunds(keyword)
  ]);
  
  // 合并结果，国内基金在前
  return [...cnFunds, ...globalFunds];
}

// 基金估值
export async function getFundEstimate(code: string): Promise<FundEstimate | null> {
  return callFundApi({ action: 'estimate', code });
}

// 基金持仓
export async function getFundHoldings(code: string): Promise<{
  holdings: Array<{ name: string; code?: string; weight: number }>;
  stockCodes: string[];
}> {
  return callFundApi({ action: 'holdings', code });
}

// 股票行情
export async function getStockQuotes(codes: string[]): Promise<StockQuote[]> {
  if (codes.length === 0) return [];
  return callFundApi({ action: 'stock_quotes', codes: codes.join(',') });
}

// 全球指数
export async function getGlobalIndices(): Promise<StockQuote[]> {
  return callFundApi({ action: 'indices' });
}
