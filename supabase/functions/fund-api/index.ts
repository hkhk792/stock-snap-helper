import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// East Money API endpoints
const FUND_SEARCH_URL = 'https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx';
const FUND_ESTIMATE_URL = 'https://fundgz.1234567.com.cn/js';
const FUND_HOLDINGS_URL = 'https://fundf10.eastmoney.com/FundArchivesDatas.aspx';
const STOCK_QUOTE_URL = 'https://push2.eastmoney.com/api/qt/ulist.np/get';
const FUND_DETAIL_URL = 'https://fund.eastmoney.com/pingzhongdata';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (action === 'search') {
      return await handleSearch(url.searchParams.get('keyword') || '');
    } else if (action === 'estimate') {
      return await handleEstimate(url.searchParams.get('code') || '');
    } else if (action === 'holdings') {
      return await handleHoldings(url.searchParams.get('code') || '');
    } else if (action === 'stock_quotes') {
      return await handleStockQuotes(url.searchParams.get('codes') || '');
    } else if (action === 'indices') {
      return await handleIndices();
    } else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Fund API error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleSearch(keyword: string) {
  if (!keyword.trim()) {
    return jsonResponse([]);
  }

  const res = await fetch(
    `${FUND_SEARCH_URL}?m=1&key=${encodeURIComponent(keyword)}`,
    { headers: { 'Referer': 'https://fund.eastmoney.com/' } }
  );
  const text = await res.text();

  try {
    // Response is JSON with Datas array
    const data = JSON.parse(text);
    const funds = (data?.Datas || []).slice(0, 10).map((item: any) => ({
      code: item.CODE,
      name: item.NAME,
      type: item.FundBaseInfo?.FTYPE || item.CATEGORYDESC || '未知',
      spell: item.SPELL,
    }));
    return jsonResponse(funds);
  } catch {
    return jsonResponse([]);
  }
}

async function handleEstimate(code: string) {
  if (!code) return jsonResponse(null);

  // Fetch real-time NAV estimate from fundgz
  const res = await fetch(`${FUND_ESTIMATE_URL}/${code}.js`, {
    headers: { 'Referer': 'https://fund.eastmoney.com/' },
  });
  const text = await res.text();

  try {
    // Response format: jsonpgz({"fundcode":"110011","name":"...","jzrq":"2026-03-14","dwjz":"5.2341","gsz":"5.2567","gszzl":"0.43",...});
    const jsonStr = text.replace(/^jsonpgz\(/, '').replace(/\);?\s*$/, '');
    const data = JSON.parse(jsonStr);
    return jsonResponse({
      code: data.fundcode,
      name: data.name,
      lastNav: parseFloat(data.dwjz),       // 上一交易日净值
      lastNavDate: data.jzrq,                // 上一交易日日期
      estimatedNav: parseFloat(data.gsz),    // 实时估算净值
      estimatedChange: parseFloat(data.gszzl), // 估算涨跌幅 %
      estimatedTime: data.gztime,            // 估算时间
    });
  } catch {
    return jsonResponse(null);
  }
}

async function handleHoldings(code: string) {
  if (!code) return jsonResponse([]);

  // Fetch top holdings from fund detail page
  const res = await fetch(
    `${FUND_DETAIL_URL}/${code}.js`,
    { headers: { 'Referer': 'https://fund.eastmoney.com/' } }
  );
  const text = await res.text();

  try {
    // Extract stockCodesNew variable (stock codes with market prefix)
    const stockCodesMatch = text.match(/var stockCodesNew="([^"]+)"/);
    // Extract stockCodes (just codes)
    const stockCodesSimple = text.match(/var stockCodes=\[([^\]]+)\]/);
    
    // Extract fund_positions (top 10 holdings with weight)
    const positionsMatch = text.match(/var fund_positions=(\[[\s\S]*?\]);/);
    
    let holdings: any[] = [];
    
    if (positionsMatch) {
      const positions = JSON.parse(positionsMatch[1]);
      // positions is array of [name, weight_percent, quantity, value]
      // But format varies, let's try to extract
      holdings = positions.map((pos: any, idx: number) => ({
        name: pos[0] || '',
        weight: parseFloat(pos[1]) || 0,
      }));
    }
    
    // Try alternative: extract from currentStockList
    if (holdings.length === 0) {
      const listMatch = text.match(/var currentStockList=(\[[\s\S]*?\]);/);
      if (listMatch) {
        const list = JSON.parse(listMatch[1]);
        holdings = list.map((item: any) => ({
          name: item.GPJC || item.gp || '',
          code: item.GPDM || '',
          weight: parseFloat(item.JZBL) || 0,
        }));
      }
    }

    // Extract stock codes for real-time quotes
    let stockCodes: string[] = [];
    if (stockCodesMatch) {
      stockCodes = stockCodesMatch[1].split(',').filter(Boolean);
    }
    
    return jsonResponse({ holdings, stockCodes });
  } catch (e) {
    console.error('Holdings parse error:', e);
    return jsonResponse({ holdings: [], stockCodes: [] });
  }
}

async function handleStockQuotes(codes: string) {
  if (!codes) return jsonResponse([]);

  // Use East Money push API for real-time stock quotes
  // codes format: "1.600519,0.000858,..." (1=SH, 0=SZ)
  const fields = 'f2,f3,f12,f14'; // f2=price, f3=change%, f12=code, f14=name
  const res = await fetch(
    `${STOCK_QUOTE_URL}?fltt=2&fields=${fields}&secids=${encodeURIComponent(codes)}`,
    { headers: { 'Referer': 'https://quote.eastmoney.com/' } }
  );
  const data = await res.json();

  const quotes = (data?.data?.diff || []).map((item: any) => ({
    code: item.f12,
    name: item.f14,
    price: item.f2,
    changePercent: item.f3,
  }));

  return jsonResponse(quotes);
}

const INDICES_URL = 'https://push2.eastmoney.com/api/qt/ulist.np/get';

// Major global indices: 上证, 深证, 创业板, 沪深300, 中证500, 恒生, 恒生科技, 纳斯达克, 标普500, 道琼斯, 日经225, 富时100
const INDICES_SECIDS = [
  '1.000001', '0.399001', '0.399006', '1.000300', '1.000905',
  '100.HSI', '100.HSTECH',
  '105.NDX', '105.SPX', '105.DJI', '105.N225',
].join(',');

async function handleIndices() {
  const fields = 'f2,f3,f4,f12,f14';
  const res = await fetch(
    `${INDICES_URL}?fltt=2&fields=${fields}&secids=${encodeURIComponent(INDICES_SECIDS)}`,
    { headers: { 'Referer': 'https://quote.eastmoney.com/' } }
  );
  const data = await res.json();
  const indices = (data?.data?.diff || []).map((item: any) => ({
    code: item.f12,
    name: item.f14,
    price: item.f2,
    changePercent: item.f3,
  }));
  return jsonResponse(indices);
}

function jsonResponse(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
