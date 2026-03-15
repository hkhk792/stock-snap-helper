import React from "react";
import { TrendingUp, TrendingDown, Trash2, Loader2 } from "lucide-react";
import { type Holding, calculateEstimatedNav } from "@/lib/fund-data";
import { type FundSearchResult, type FundEstimate } from "@/lib/fund-api";
import { Skeleton } from "@/components/ui/skeleton";

interface FundCardProps {
  fund: FundSearchResult;
  estimate: FundEstimate | null;
  holdings: Holding[];
  loading?: boolean;
  onRemove: () => void;
  onClick: () => void;
}

const FundCard: React.FC<FundCardProps> = ({ fund, estimate, holdings, loading, onRemove, onClick }) => {
  // Use real estimate if available, otherwise calculate from holdings
  let displayNav: number;
  let displayChange: number;
  let lastNav: number | null = null;
  let lastNavDate: string | null = null;

  if (estimate) {
    displayNav = estimate.estimatedNav;
    displayChange = estimate.estimatedChange;
    lastNav = estimate.lastNav;
    lastNavDate = estimate.lastNavDate;
  } else {
    // Fallback to manual calculation
    const calc = calculateEstimatedNav(0, holdings);
    displayNav = calc.estimatedNav;
    displayChange = calc.totalChange;
  }

  const isGain = displayChange >= 0;

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

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : (
        <>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {estimate ? "实时估算" : "估算净值"}
              </p>
              <p className={`text-2xl font-bold tabular-nums ${isGain ? "text-gain" : "text-loss"}`}>
                {displayNav.toFixed(4)}
              </p>
            </div>
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-semibold ${isGain ? "bg-gain-light text-gain" : "bg-loss-light text-loss"}`}>
              {isGain ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {isGain ? "+" : ""}{displayChange.toFixed(2)}%
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {lastNav != null ? (
                <>上一净值: {lastNav.toFixed(4)}{lastNavDate ? `（${lastNavDate}）` : ''} · </>
              ) : null}
              持仓 {holdings.length} 只
              {estimate?.estimatedTime && (
                <> · 更新: {estimate.estimatedTime.slice(11, 16)}</>
              )}
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default FundCard;
