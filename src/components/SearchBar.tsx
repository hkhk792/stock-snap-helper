import React, { useState, useRef, useCallback, useEffect } from "react";
import { Search, Loader2, Star, TrendingUp, TrendingDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchFundsApi, getFundEstimate, type FundSearchResult, type FundEstimate } from "@/lib/fund-api";
import { useSession } from "@/hooks/useSession";
import { addFavorite, removeFavorite } from "@/lib/fund-api";
import { toast } from "sonner";

interface SearchBarProps {
  onSelectFund: (fund: FundSearchResult) => void;
  favorites?: Set<string>;
  onToggleFavorite?: (fund: FundSearchResult, isFavorited: boolean) => void;
}

interface SearchResultWithEstimate extends FundSearchResult {
  estimate?: FundEstimate;
  loadingEstimate?: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSelectFund, favorites = new Set(), onToggleFavorite }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultWithEstimate[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { user } = useSession();

  // 获取搜索结果的估值
  const fetchEstimates = useCallback(async (funds: FundSearchResult[]) => {
    const updatedResults = [...funds];
    
    // 并行获取前5个基金的估值
    const topFunds = funds.slice(0, 5);
    const estimates = await Promise.all(
      topFunds.map(fund => getFundEstimate(fund.code).catch(() => null))
    );
    
    estimates.forEach((estimate, index) => {
      if (estimate && updatedResults[index]) {
        updatedResults[index] = {
          ...updatedResults[index],
          estimate,
          loadingEstimate: false
        };
      }
    });
    
    setResults(updatedResults);
  }, []);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setShowResults(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const found = await searchFundsApi(value);
        const resultsWithLoading = found.map(fund => ({
          ...fund,
          loadingEstimate: true
        }));
        setResults(resultsWithLoading);
        // 获取估值
        if (found.length > 0) {
          fetchEstimates(found);
        }
      } catch (e) {
        console.error('Search failed:', e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 150);
  }, [fetchEstimates]);

  const handleSelect = (fund: FundSearchResult) => {
    onSelectFund(fund);
    setQuery("");
    setShowResults(false);
  };

  const handleToggleFavorite = async (fund: FundSearchResult, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!user) {
      toast.error("请先登录后再收藏基金");
      return;
    }
    
    const isFavorited = favorites.has(fund.code);
    
    if (isFavorited) {
      const success = await removeFavorite(user.id, fund.code);
      if (success) {
        toast.success("已取消收藏");
        onToggleFavorite?.(fund, false);
      }
    } else {
      const success = await addFavorite(user.id, fund.code, fund.name);
      if (success) {
        toast.success("收藏成功");
        onToggleFavorite?.(fund, true);
      }
    }
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 rounded-lg bg-card border border-border p-1">
        <div className="flex items-center flex-1 gap-2 px-3">
          {loading ? (
            <Loader2 className="h-4 w-4 text-muted-foreground shrink-0 animate-spin" />
          ) : (
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => query && setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 200)}
            placeholder="搜索基金名称或代码..."
            className="border-0 shadow-none focus-visible:ring-0 h-10 text-sm px-0"
          />
        </div>
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card rounded-lg border border-border shadow-lg z-50 overflow-hidden max-h-[400px] overflow-y-auto">
          {results.map((fund) => {
            const isFavorited = favorites.has(fund.code);
            const estimate = fund.estimate;
            const changePercent = estimate?.estimatedChange || 0;
            const isPositive = changePercent >= 0;
            
            return (
              <button
                key={fund.code}
                onClick={() => handleSelect(fund)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors text-left border-b border-border last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{fund.name}</span>
                    <span className="text-xs text-muted-foreground">{fund.code}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{fund.type}</span>
                    {fund.loadingEstimate ? (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    ) : estimate ? (
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                          {estimate.estimatedNav.toFixed(4)}
                        </span>
                        <span className={`text-xs flex items-center gap-0.5 ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                          {isPositive ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <button
                  onClick={(e) => handleToggleFavorite(fund, e)}
                  className="p-1.5 rounded transition-colors hover:bg-muted ml-2 shrink-0"
                >
                  <Star
                    className={`h-4 w-4 ${
                      isFavorited
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-muted-foreground'
                    }`}
                  />
                </button>
              </button>
            );
          })}
        </div>
      )}

      {showResults && query && !loading && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card rounded-lg border border-border shadow-lg z-50 p-4 text-center text-sm text-muted-foreground">
          未找到相关基金
        </div>
      )}
    </div>
  );
};

export default SearchBar;
