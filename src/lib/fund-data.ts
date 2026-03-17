// Mock fund database for search
export interface FundInfo {
  code: string;
  name: string;
  type: string;
  lastNav: number;
  lastNavDate: string;
}

export const MOCK_FUNDS: FundInfo[] = [
  { code: "110011", name: "易方达中小盘混合", type: "混合型", lastNav: 5.2341, lastNavDate: "2026-03-14" },
  { code: "161725", name: "招商中证白酒指数", type: "指数型", lastNav: 1.0235, lastNavDate: "2026-03-14" },
  { code: "005827", name: "易方达蓝筹精选混合", type: "混合型", lastNav: 2.1456, lastNavDate: "2026-03-14" },
  { code: "003834", name: "华夏能源革新股票", type: "股票型", lastNav: 2.8910, lastNavDate: "2026-03-14" },
  { code: "260108", name: "景顺长城新兴成长混合", type: "混合型", lastNav: 3.4520, lastNavDate: "2026-03-14" },
  { code: "519736", name: "交银优势行业混合", type: "混合型", lastNav: 4.1230, lastNavDate: "2026-03-14" },
  { code: "163406", name: "兴全合润混合", type: "混合型", lastNav: 1.8760, lastNavDate: "2026-03-14" },
  { code: "001938", name: "中欧时代先锋股票A", type: "股票型", lastNav: 2.3450, lastNavDate: "2026-03-14" },
];

export interface Holding {
  id: string;
  name: string;
  code: string;
  alias?: string;
  sector?: string;
  weight: number; // percentage 0-100
  change: number; // percentage change like +1.5 or -0.8
  buyAmount?: number; // CNY
  buyPrice?: number; // CNY per share
  shares?: number; // shares count
}

export function calculateEstimatedNav(
  lastNav: number,
  holdings: Holding[]
): { estimatedNav: number; totalChange: number } {
  const totalWeight = holdings.reduce((sum, h) => sum + h.weight, 0);
  if (totalWeight === 0 || holdings.length === 0) {
    return { estimatedNav: lastNav, totalChange: 0 };
  }

  // Weighted average change
  const weightedChange = holdings.reduce((sum, h) => {
    return sum + (h.weight / 100) * (h.change / 100);
  }, 0);

  const estimatedNav = lastNav * (1 + weightedChange);
  const totalChange = weightedChange * 100;

  return { estimatedNav, totalChange };
}

export function searchFunds(query: string): FundInfo[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return MOCK_FUNDS.filter(
    (f) => f.code.includes(q) || f.name.toLowerCase().includes(q)
  );
}
