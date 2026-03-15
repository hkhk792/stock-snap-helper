import React from "react";
import { TrendingUp, TrendingDown, Trash2 } from "lucide-react";
import { type FundInfo, type Holding, calculateEstimatedNav } from "@/lib/fund-data";

interface FundCardProps {
  fund: FundInfo;
  holdings: Holding[];
  onRemove: () => void;
  onClick: () => void;
}

const FundCard: React.FC<FundCardProps> = ({ fund, holdings, onRemove, onClick }) => {
  const { estimatedNav, totalChange } = calculateEstimatedNav(fund.lastNav, holdings);
  const isGain = totalChange >= 0;

  return (
    <div
      className="bg-card rounded-lg border border-border p-5 hover:shadow-md transition-shadow cursor-pointer relative group"
      onClick={onClick}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-muted"
      >
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </button>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{fund.name}</h3>
          <span className="text-xs text-muted-foreground">{fund.code} · {fund.type}</span>
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-muted-foreground mb-1">估算净值</p>
          <p className={`text-2xl font-bold tabular-nums ${isGain ? "text-gain" : "text-loss"}`}>
            {estimatedNav.toFixed(4)}
          </p>
        </div>
        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-semibold ${isGain ? "bg-gain-light text-gain" : "bg-loss-light text-loss"}`}>
          {isGain ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {isGain ? "+" : ""}{totalChange.toFixed(2)}%
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-xs text-muted-foreground">
          上一净值: {fund.lastNav.toFixed(4)}（{fund.lastNavDate}）· 持仓 {holdings.length} 只
        </p>
      </div>
    </div>
  );
};

export default FundCard;
