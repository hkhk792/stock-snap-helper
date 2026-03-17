import React, { useMemo, useState } from "react";
import { Plus, Trash2, ArrowLeft, RefreshCw, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { type Holding, calculateEstimatedNav } from "@/lib/fund-data";
import { type FundSearchResult, type FundEstimate } from "@/lib/fund-api";

interface HoldingsEditorProps {
  fund: FundSearchResult;
  estimate: FundEstimate | null;
  holdings: Holding[];
  onUpdateHoldings: (holdings: Holding[]) => void;
  onBack: () => void;
  onRefresh: () => void;
}

const HoldingsEditor: React.FC<HoldingsEditorProps> = ({ fund, estimate, holdings, onUpdateHoldings, onBack, onRefresh }) => {
  const [localHoldings, setLocalHoldings] = useState<Holding[]>(holdings);
  const [refreshing, setRefreshing] = useState(false);
  const [autoWeight, setAutoWeight] = useState(true);
  const [sectorFilter, setSectorFilter] = useState<string>("");

  const sectorPresets = useMemo(
    () => [
      "白酒",
      "新能源",
      "半导体",
      "医药",
      "AI",
      "互联网",
      "金融",
      "消费",
      "汽车",
      "军工",
      "有色",
      "煤炭",
      "电力",
      "银行",
      "传媒",
      "软件",
    ],
    [],
  );

  const computedHoldings = useMemo(() => {
    if (!autoWeight) return localHoldings;
    const total = localHoldings.reduce((sum, h) => sum + Number(h.buyAmount || 0), 0);
    if (!total) return localHoldings;
    return localHoldings.map((h) => ({
      ...h,
      weight: Number(h.buyAmount || 0) > 0 ? (Number(h.buyAmount || 0) / total) * 100 : 0,
    }));
  }, [autoWeight, localHoldings]);

  const availableSectors = useMemo(() => {
    const fromData = computedHoldings
      .map((h) => (h.sector || "").trim())
      .filter(Boolean);
    const set = new Set<string>([...sectorPresets, ...fromData]);
    return Array.from(set);
  }, [computedHoldings, sectorPresets]);

  const visibleHoldings = useMemo(() => {
    const f = sectorFilter.trim();
    if (!f) return computedHoldings;
    return computedHoldings.filter((h) => (h.sector || "").trim() === f);
  }, [computedHoldings, sectorFilter]);

  // Use real estimate data if available
  const useRealEstimate = !!estimate;
  const { estimatedNav: calcNav, totalChange: calcChange } = calculateEstimatedNav(
    estimate?.lastNav || 0,
    computedHoldings
  );

  const displayNav = useRealEstimate ? estimate!.estimatedNav : calcNav;
  const displayChange = useRealEstimate ? estimate!.estimatedChange : calcChange;
  const lastNav = estimate?.lastNav || 0;

  const totalWeight = computedHoldings.reduce((sum, h) => sum + h.weight, 0);
  const totalBuyAmount = useMemo(
    () => computedHoldings.reduce((sum, h) => sum + Number(h.buyAmount || 0), 0),
    [computedHoldings],
  );
  const totalPnl = useMemo(
    () =>
      computedHoldings.reduce((sum, h) => {
        const amt = Number(h.buyAmount || 0);
        return sum + amt * (Number(h.change || 0) / 100);
      }, 0),
    [computedHoldings],
  );
  const totalPnlPct = totalBuyAmount > 0 ? (totalPnl / totalBuyAmount) * 100 : 0;
  const isGain = displayChange >= 0;

  const addHolding = () => {
    const newHolding: Holding = {
      id: crypto.randomUUID(),
      name: "",
      code: "",
      alias: "",
      weight: 0,
      change: 0,
      buyAmount: 0,
      buyPrice: 0,
      shares: 0,
    };
    const updated = [...localHoldings, newHolding];
    setLocalHoldings(updated);
    onUpdateHoldings(updated);
  };

  const updateHolding = (id: string, field: keyof Holding, value: string | number) => {
    const updated = localHoldings.map((h) => {
      if (h.id !== id) return h;
      const next: Holding = { ...h, [field]: value } as Holding;

      const bp = Number(next.buyPrice || 0);
      const sh = Number(next.shares || 0);
      if ((field === "buyPrice" || field === "shares") && bp > 0 && sh > 0) {
        next.buyAmount = Math.round(bp * sh * 100) / 100;
      }
      return next;
    });
    setLocalHoldings(updated);
    onUpdateHoldings(updated);
  };

  const removeHolding = (id: string) => {
    const updated = localHoldings.filter((h) => h.id !== id);
    setLocalHoldings(updated);
    onUpdateHoldings(updated);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-md hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">{fund.name}</h2>
          <p className="text-xs text-muted-foreground">{fund.code} · {fund.type}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      {/* Summary Card */}
      <div className="bg-card rounded-lg border border-border p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              {useRealEstimate ? "实时估算净值" : "手动估算净值"}
            </p>
            <p className={`text-3xl font-bold tabular-nums ${isGain ? "text-gain" : "text-loss"}`}>
              {displayNav.toFixed(4)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-1">估算涨跌</p>
            <p className={`text-2xl font-bold tabular-nums ${isGain ? "text-gain" : "text-loss"}`}>
              {isGain ? "+" : ""}{displayChange.toFixed(2)}%
            </p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border flex flex-wrap justify-between text-xs text-muted-foreground gap-2">
          {lastNav > 0 && <span>上一净值: {lastNav.toFixed(4)}</span>}
          <span>持仓占比合计: {totalWeight.toFixed(1)}%</span>
          {totalBuyAmount > 0 && <span>购买金额合计: ¥ {totalBuyAmount.toLocaleString()}</span>}
          {totalBuyAmount > 0 && (
            <span className={totalPnl >= 0 ? "text-gain" : "text-loss"}>
              预估盈亏: {totalPnl >= 0 ? "+" : ""}¥ {totalPnl.toFixed(2)}（{totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%）
            </span>
          )}
          {estimate?.estimatedTime && (
            <span>更新时间: {estimate.estimatedTime}</span>
          )}
        </div>
      </div>

      {/* Holdings Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">持仓明细</h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>按金额算权重</span>
              <Switch checked={autoWeight} onCheckedChange={setAutoWeight} />
            </div>
            <Button size="sm" onClick={addHolding} className="h-8 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />
              添加持仓
            </Button>
          </div>
        </div>

        {/* Sector filter */}
        <div className="px-5 py-3 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSectorFilter("")}
              className={`h-7 px-2.5 rounded-md text-xs border transition-colors ${
                !sectorFilter
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background border-border text-foreground hover:bg-muted"
              }`}
            >
              全部
            </button>
            {availableSectors.slice(0, 20).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSectorFilter(s)}
                className={`h-7 px-2.5 rounded-md text-xs border transition-colors ${
                  sectorFilter === s
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background border-border text-foreground hover:bg-muted"
                }`}
                title={`筛选行业：${s}`}
              >
                {s}
              </button>
            ))}
            <div className="ml-auto text-xs text-muted-foreground">
              显示 {visibleHoldings.length}/{computedHoldings.length}
            </div>
          </div>
        </div>

        {localHoldings.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            暂无持仓数据，点击刷新按钮获取实时持仓，或手动添加
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* Table Header */}
            <div className="grid grid-cols-14 gap-2 px-5 py-2 text-xs font-medium text-muted-foreground bg-muted/50">
              <div className="col-span-2">行业</div>
              <div className="col-span-2">备注名</div>
              <div className="col-span-3">股票名称</div>
              <div className="col-span-2">代码</div>
              <div className="col-span-2">占比(%)</div>
              <div className="col-span-2">涨跌(%)</div>
              <div className="col-span-1">购买金额</div>
              <div className="col-span-2">权重贡献</div>
              <div className="col-span-1"></div>
            </div>

            {visibleHoldings.map((holding) => {
              const contribution = (holding.weight / 100) * holding.change;
              const isHoldingGain = holding.change >= 0;
              const pnl = Number(holding.buyAmount || 0) * (Number(holding.change || 0) / 100);
              const pnlPct = Number(holding.change || 0);
              return (
                <div key={holding.id} className="grid grid-cols-14 gap-2 px-5 py-2.5 items-center">
                  <div className="col-span-2">
                    <Input
                      value={holding.sector || ""}
                      onChange={(e) => updateHolding(holding.id, "sector", e.target.value)}
                      placeholder="行业"
                      list="sector-options"
                      className="h-8 text-xs border-border"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      value={holding.alias || ""}
                      onChange={(e) => updateHolding(holding.id, "alias", e.target.value)}
                      placeholder="备注"
                      className="h-8 text-xs border-border"
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      value={holding.name}
                      onChange={(e) => updateHolding(holding.id, "name", e.target.value)}
                      placeholder="股票名称"
                      className="h-8 text-xs border-border"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      value={holding.code}
                      onChange={(e) => updateHolding(holding.id, "code", e.target.value)}
                      placeholder="代码"
                      className="h-8 text-xs border-border"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      value={holding.weight || ""}
                      onChange={(e) => updateHolding(holding.id, "weight", parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      disabled={autoWeight}
                      className="h-8 text-xs border-border tabular-nums disabled:opacity-60"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      value={holding.change || ""}
                      onChange={(e) => updateHolding(holding.id, "change", parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="h-8 text-xs border-border tabular-nums"
                    />
                  </div>
                  <div className="col-span-1">
                    <Input
                      type="number"
                      value={holding.buyAmount || ""}
                      onChange={(e) => updateHolding(holding.id, "buyAmount", parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="h-8 text-xs border-border tabular-nums"
                    />
                  </div>
                  <div className="col-span-2">
                    <div className={`text-xs tabular-nums font-semibold ${pnl >= 0 ? "text-gain" : "text-loss"}`}>
                      {pnl >= 0 ? "+" : ""}¥ {pnl.toFixed(2)}
                      <span className="ml-1 font-medium opacity-80">({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)</span>
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        value={holding.buyPrice || ""}
                        onChange={(e) => updateHolding(holding.id, "buyPrice", parseFloat(e.target.value) || 0)}
                        placeholder="成本价"
                        className="h-8 text-xs border-border tabular-nums"
                      />
                      <Input
                        type="number"
                        value={holding.shares || ""}
                        onChange={(e) => updateHolding(holding.id, "shares", parseFloat(e.target.value) || 0)}
                        placeholder="份额"
                        className="h-8 text-xs border-border tabular-nums"
                      />
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isHoldingGain ? "bg-gain" : "bg-loss"}`}
                        style={{ width: `${Math.min(Math.abs(contribution) * 20, 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs tabular-nums font-medium ${isHoldingGain ? "text-gain" : "text-loss"}`}>
                      {contribution >= 0 ? "+" : ""}{contribution.toFixed(3)}
                    </span>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      onClick={() => removeHolding(holding.id)}
                      className="p-1 rounded hover:bg-muted transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <datalist id="sector-options">
        {availableSectors.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
};

export default HoldingsEditor;
