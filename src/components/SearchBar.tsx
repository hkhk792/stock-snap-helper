import React, { useState, useRef, useCallback } from "react";
import { Search, Camera, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchFundsApi, type FundSearchResult } from "@/lib/fund-api";

interface SearchBarProps {
  onSelectFund: (fund: FundSearchResult) => void;
  onOpenScreenshot: () => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSelectFund, onOpenScreenshot }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FundSearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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
        setResults(found);
      } catch (e) {
        console.error('Search failed:', e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const handleSelect = (fund: FundSearchResult) => {
    onSelectFund(fund);
    setQuery("");
    setShowResults(false);
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
        <button
          onClick={onOpenScreenshot}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
        >
          <Camera className="h-4 w-4" />
          <span className="hidden sm:inline">截图识别</span>
        </button>
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card rounded-lg border border-border shadow-lg z-50 overflow-hidden">
          {results.map((fund) => (
            <button
              key={fund.code}
              onClick={() => handleSelect(fund)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors text-left"
            >
              <div>
                <span className="text-sm font-medium text-foreground">{fund.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{fund.code}</span>
              </div>
              <span className="text-xs text-muted-foreground">{fund.type}</span>
            </button>
          ))}
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
