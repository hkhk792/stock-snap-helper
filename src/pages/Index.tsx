import React, { useState, useEffect, useCallback } from "react";
import { BarChart3, TrendingUp, RefreshCw, Loader2 } from "lucide-react";
import SearchBar from "@/components/SearchBar";
import FundCard from "@/components/FundCard";
import HoldingsEditor from "@/components/HoldingsEditor";
import { useSession } from "@/hooks/useSession";
import { AuthButton } from "@/components/AuthButton";
import { NavLink } from "@/components/NavLink";

import { type Holding } from "@/lib/fund-data";
import { type FundSearchResult, type FundEstimate, getFundEstimate, getFundHoldings, getStockQuotes } from "@/lib/fund-api";
import { getFavorites, addFavorite, removeFavorite } from "@/lib/favorites-store";
import { toast } from "sonner";

interface TrackedFund {
  fund: FundSearchResult;
  estimate: FundEstimate | null;
  holdings: Holding[];
  loading?: boolean;
}

const Index = () => {
  const { user } = useSession();
  const [trackedFunds, setTrackedFunds] = useState<TrackedFund[]>([]);
  const [selectedFundCode, setSelectedFundCode] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // 初始化加载自选列表
  useEffect(() => {
    if (user?.id) {
      getFavorites(user.id).then((favs) => {
        const codes = new Set(favs.map((f) => f.fund_code));
        setFavorites(codes);
        // 同时加载这些基金的数据
        favs.forEach((fav) => {
          if (!trackedFunds.find((t) => t.fund.code === fav.fund_code)) {
            setTrackedFunds((prev) => [
              ...prev,
              {
                fund: {
                  code: fav.fund_code,
                  name: fav.fund_name,
                  type: '基金',
                },
                estimate: null,
                holdings: [],
                loading: true,
              } as any,
            ]);
          }
        });
      });
    }
  }, [user?.id]);

  const fetchFundData = useCallback(async (code: string) => {
    try {
      const [estimate, holdingsData] = await Promise.all([
        getFundEstimate(code),
        getFundHoldings(code),
      ]);

      let holdings: Holding[] = [];
      if (holdingsData?.holdings?.length > 0) {
        // Get real-time stock quotes
        let quotes: Record<string, number> = {};
        if (holdingsData.stockCodes?.length > 0) {
          try {
            const stockQuotes = await getStockQuotes(holdingsData.stockCodes);
            stockQuotes.forEach((q) => {
              quotes[q.name] = q.changePercent;
              quotes[q.code] = q.changePercent;
            });
          } catch (e) {
            console.error('Failed to fetch stock quotes:', e);
          }
        }

        holdings = holdingsData.holdings.map((h, idx) => ({
          id: crypto.randomUUID(),
          name: h.name,
          code: h.code || '',
          weight: h.weight,
          change: quotes[h.name] ?? quotes[h.code || ''] ?? 0,
        }));
      }

      return { estimate, holdings };
    } catch (e) {
      console.error(`Failed to fetch fund ${code}:`, e);
      return { estimate: null, holdings: [] };
    }
  }, []);

  const handleSelectFund = async (fund: FundSearchResult) => {
    // 仅当已收藏时，进入编辑模式
    if (!favorites.has(fund.code)) {
      toast.info('请先点击星标收藏基金');
      return;
    }
    if (trackedFunds.find((t) => t.fund.code === fund.code)) {
      setSelectedFundCode(fund.code);
      return;
    }

    setTrackedFunds((prev) => [...prev, { fund, estimate: null, holdings: [], loading: true }]);
    setSelectedFundCode(fund.code);

    const data = await fetchFundData(fund.code);

    setTrackedFunds((prev) =>
      prev.map((t) =>
        t.fund.code === fund.code
          ? { ...t, estimate: data.estimate, holdings: data.holdings, loading: false }
          : t
      )
    );

    if (data.estimate) {
      toast.success(`已加载 ${data.estimate.name} 的实时数据`);
    }
  };

  // 切换基金的收藏状态
  const handleToggleFavorite = async (fund: FundSearchResult, shouldFavorite: boolean) => {
    if (!user?.id) {
      toast.error('请先登录');
      return;
    }

    if (shouldFavorite) {
      // 添加到自选
      const result = await addFavorite(user.id, fund.code, fund.name);
      if (result) {
        setFavorites((prev) => new Set([...prev, fund.code]));
        toast.success(`已添加 ${fund.name} 到自选`);
        // 自动添加到trackedFunds并加载数据
        if (!trackedFunds.find((t) => t.fund.code === fund.code)) {
          setTrackedFunds((prev) => [...prev, { fund, estimate: null, holdings: [], loading: true }]);
          const data = await fetchFundData(fund.code);
          setTrackedFunds((prev) =>
            prev.map((t) =>
              t.fund.code === fund.code
                ? { ...t, estimate: data.estimate, holdings: data.holdings, loading: false }
                : t
            )
          );
        }
      }
    } else {
      // 从自选移除
      const result = await removeFavorite(user.id, fund.code);
      if (result) {
        setFavorites((prev) => {
          const newSet = new Set(prev);
          newSet.delete(fund.code);
          return newSet;
        });
        setTrackedFunds((prev) => prev.filter((t) => t.fund.code !== fund.code));
        if (selectedFundCode === fund.code) setSelectedFundCode(null);
        toast.success(`已从自选移除 ${fund.name}`);
      }
    }
  };

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      const updates = await Promise.all(
        trackedFunds.map(async (t) => {
          const data = await fetchFundData(t.fund.code);
          return { code: t.fund.code, ...data };
        })
      );

      setTrackedFunds((prev) =>
        prev.map((t) => {
          const update = updates.find((u) => u.code === t.fund.code);
          if (!update) return t;
          return {
            ...t,
            estimate: update.estimate,
            holdings: update.holdings.length > 0 ? update.holdings : t.holdings,
          };
        })
      );
      toast.success('数据已刷新');
    } finally {
      setRefreshing(false);
    }
  };

  const handleRemoveFund = (code: string) => {
    setTrackedFunds((prev) => prev.filter((t) => t.fund.code !== code));
    if (selectedFundCode === code) setSelectedFundCode(null);
  };

  const handleUpdateHoldings = (code: string, holdings: Holding[]) => {
    setTrackedFunds((prev) =>
      prev.map((t) => (t.fund.code === code ? { ...t, holdings } : t))
    );
  };

  const handleImportHoldings = (holdings: Holding[]) => {
    if (selectedFundCode) {
      handleUpdateHoldings(selectedFundCode, holdings);
    } else if (trackedFunds.length > 0) {
      handleUpdateHoldings(trackedFunds[0].fund.code, holdings);
      setSelectedFundCode(trackedFunds[0].fund.code);
    }
  };

  const selectedTracked = trackedFunds.find((t) => t.fund.code === selectedFundCode);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary">
              <BarChart3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h1 className="text-base font-bold text-foreground tracking-tight">基金实时估值</h1>
              <p className="text-xs text-muted-foreground">RealValue</p>
            </div>
            <NavLink
              to="/portfolios"
              className="hidden sm:inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs text-foreground hover:bg-muted transition-colors"
              activeClassName="bg-muted"
            >
              我的组合
            </NavLink>
            {trackedFunds.length > 0 && (
              <button
                onClick={handleRefreshAll}
                disabled={refreshing}
                className="p-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </button>
            )}
            <AuthButton />
          </div>
          <SearchBar
            onSelectFund={handleSelectFund}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">

        {selectedFundCode && selectedTracked ? (
          <HoldingsEditor
            fund={selectedTracked.fund}
            estimate={selectedTracked.estimate}
            holdings={selectedTracked.holdings}
            onUpdateHoldings={(h) => handleUpdateHoldings(selectedFundCode, h)}
            onBack={() => setSelectedFundCode(null)}
            onRefresh={() => fetchFundData(selectedFundCode).then((data) => {
              setTrackedFunds((prev) =>
                prev.map((t) =>
                  t.fund.code === selectedFundCode
                    ? { ...t, estimate: data.estimate, holdings: data.holdings.length > 0 ? data.holdings : t.holdings }
                    : t
                )
              );
            })}
          />
        ) : (
          <div className="space-y-4">
            {trackedFunds.length > 0 && (
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                我的自选 ({trackedFunds.length})
              </h2>
            )}

            {trackedFunds.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="p-4 rounded-full bg-accent mb-4">
                  <TrendingUp className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-2">开始收藏基金</h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                  通过上方搜索栏搜索基金，点击星标收藏到自选，实时估算基金净值
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {trackedFunds.map((tracked) => (
                  <FundCard
                    key={tracked.fund.code}
                    fund={tracked.fund}
                    estimate={tracked.estimate}
                    holdings={tracked.holdings}
                    loading={tracked.loading}
                    onRemove={() => handleRemoveFund(tracked.fund.code)}
                    onClick={() => setSelectedFundCode(tracked.fund.code)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Screenshot Modal */}
        {/* 截图功能已删除 */}
    </div>
  );
};

export default Index;
