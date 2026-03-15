import React, { useState } from "react";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { type FundInfo, type Holding, calculateEstimatedNav } from "@/lib/fund-data";

interface HoldingsEditorProps {
  fund: FundInfo;
  holdings: Holding[];
  onUpdateHoldings: (holdings: Holding[]) => void;
  onBack: () => void;
}

const HoldingsEditor: React.FC<HoldingsEditorProps> = ({ fund, holdings, onUpdateHoldings, onBack }) => {
  const [localHoldings, setLocalHoldings] = useState<Holding[]>(holdings);

  const addHolding = () => {
    const newHolding: Holding = {
      id: crypto.randomUUID(),
      name: "",
      code: "",
      weight: 0,
      change: 0,
    };
    const updated = [...localHoldings, newHolding];
    setLocalHoldings(updated);
    onUpdateHoldings(updated);
  };

  const updateHolding = (id: string, field: keyof Holding, value: string | number) => {
    const updated = localHoldings.map((h) =>
      h.id === id ? { ...h, [field]: value } : h
    );
    setLocalHoldings(updated);
    onUpdateHoldings(updated);
  };

  const removeHolding = (id: string) => {
    const updated = localHoldings.filter((h) => h.id !== id);
    setLocalHoldings(updated);
    onUpdateHoldings(updated);
  };

  const { estimatedNav, totalChange } = calculateEstimatedNav(fund.lastNav, localHoldings);
  const totalWeight = localHoldings.reduce((sum, h) => sum + h.weight, 0);
  const isGain = totalChange >= 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-md hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h2 className="text-lg font-semibold text-foreground">{fund.name}</h2>
          <p className="text-xs text-muted-foreground">{fund.code} · {fund.type}</p>
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-card rounded-lg border border-border p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">实时估算净值</p>
            <p className={`text-3xl font-bold tabular-nums ${isGain ? "text-gain" : "text-loss"}`}>
              {estimatedNav.toFixed(4)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-1">估算涨跌</p>
            <p className={`text-2xl font-bold tabular-nums ${isGain ? "text-gain" : "text-loss"}`}>
              {isGain ? "+" : ""}{totalChange.toFixed(2)}%
            </p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border flex justify-between text-xs text-muted-foreground">
          <span>上一净值: {fund.lastNav.toFixed(4)}</span>
          <span>持仓占比合计: {totalWeight.toFixed(1)}%</span>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">持仓明细</h3>
          <Button size="sm" onClick={addHolding} className="h-8 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" />
            添加持仓
          </Button>
        </div>

        {localHoldings.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            暂无持仓数据，请点击"添加持仓"或使用截图识别
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 px-5 py-2 text-xs font-medium text-muted-foreground bg-muted/50">
              <div className="col-span-3">股票名称</div>
              <div className="col-span-2">代码</div>
              <div className="col-span-2">占比(%)</div>
              <div className="col-span-2">涨跌(%)</div>
              <div className="col-span-2">权重贡献</div>
              <div className="col-span-1"></div>
            </div>

            {localHoldings.map((holding) => {
              const contribution = (holding.weight / 100) * holding.change;
              const isHoldingGain = holding.change >= 0;
              return (
                <div key={holding.id} className="grid grid-cols-12 gap-2 px-5 py-2.5 items-center">
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
                      className="h-8 text-xs border-border tabular-nums"
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
    </div>
  );
};

export default HoldingsEditor;
