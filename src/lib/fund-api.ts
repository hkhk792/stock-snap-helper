// 后端 API 地址
const BACKEND_URL = "https://stock-snap-helper.onrender.com";

// 本地缓存
const cache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_DURATION = 60 * 1000; // 1分钟缓存

export interface FundSearchResult {
  code: string;
  name: string;
  type: string;
  spell?: string;
  estimatedNav?: number;
  estimatedChange?: number;
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

export interface FavoriteFund {
  id: number;
  user_id: string;
  fund_code: string;
  fund_name: string;
  created_at: string;
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

// 带超时的 fetch
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// 基金搜索 - 使用后端 API（统一搜索国内和海外）
export async function searchFundsApi(keyword: string): Promise<FundSearchResult[]> {
  if (!keyword.trim()) return [];
  
  const cacheKey = `search_${keyword}`;
  const cachedData = getCachedData(cacheKey);
  if (cachedData) return cachedData;
  
  try {
    const url = `${BACKEND_URL}/api/fund/search?keyword=${encodeURIComponent(keyword)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = await res.json();
    const result = (data || []).map((item: any) => ({
      code: item.code,
      name: item.name,
      type: item.type || '未知',
      spell: item.spell || item.pinyin,
    }));
    setCachedData(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Fund search error:', error);
    return [];
  }
}

// 基金估值 - 使用后端 API
export async function getFundEstimate(code: string): Promise<FundEstimate | null> {
  const cacheKey = `estimate_${code}`;
  const cachedData = getCachedData(cacheKey);
  if (cachedData) return cachedData;
  
  try {
    const url = `${BACKEND_URL}/api/fund/estimate?code=${code}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = await res.json();
    
    if (!data) return null;
    
    const result = {
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

// 基金持仓 - 使用后端 API
export async function getFundHoldings(code: string): Promise<{
  holdings: Array<{ name: string; code?: string; weight: number }>;
  stockCodes: string[];
}> {
  const cacheKey = `holdings_${code}`;
  const cachedData = getCachedData(cacheKey);
  if (cachedData) return cachedData;
  
  try {
    const url = `${BACKEND_URL}/api/fund/holdings?code=${code}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return { holdings: [], stockCodes: [] };
    const data = await res.json();
    
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

// 股票行情 - 使用后端 API
export async function getStockQuotes(codes: string[]): Promise<StockQuote[]> {
  if (codes.length === 0) return [];
  
  const cacheKey = `quotes_${codes.join(',')}`;
  const cachedData = getCachedData(cacheKey);
  if (cachedData) return cachedData;
  
  try {
    const url = `${BACKEND_URL}/api/quotes?codes=${codes.join(',')}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = await res.json();
    
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

// 全球指数 - 使用后端 API
export async function getGlobalIndices(): Promise<StockQuote[]> {
  const cacheKey = 'global_indices';
  const cachedData = getCachedData(cacheKey);
  if (cachedData) return cachedData;
  
  try {
    const url = `${BACKEND_URL}/api/indices`;
    const res = await fetchWithTimeout(url, {}, 15000);
    if (!res.ok) return [];
    const data = await res.json();
    
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

// ============== 用户收藏功能 ==============

// 获取用户收藏
export async function getUserFavorites(userId: string): Promise<FavoriteFund[]> {
  try {
    const url = `${BACKEND_URL}/api/user/favorites?user_id=${encodeURIComponent(userId)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.favorites || [];
  } catch (error) {
    console.error('Get favorites error:', error);
    return [];
  }
}

// 添加收藏
export async function addFavorite(userId: string, fundCode: string, fundName: string): Promise<boolean> {
  try {
    const url = `${BACKEND_URL}/api/user/favorites?user_id=${encodeURIComponent(userId)}&fund_code=${encodeURIComponent(fundCode)}&fund_name=${encodeURIComponent(fundName)}`;
    const res = await fetchWithTimeout(url, { method: 'POST' });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  } catch (error) {
    console.error('Add favorite error:', error);
    return false;
  }
}

// 删除收藏
export async function removeFavorite(userId: string, fundCode: string): Promise<boolean> {
  try {
    const url = `${BACKEND_URL}/api/user/favorites?user_id=${encodeURIComponent(userId)}&fund_code=${encodeURIComponent(fundCode)}`;
    const res = await fetchWithTimeout(url, { method: 'DELETE' });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  } catch (error) {
    console.error('Remove favorite error:', error);
    return false;
  }
}
