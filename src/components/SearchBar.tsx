import React, { useState, useRef } from "react";
import { Search, Camera } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchFunds, type FundInfo } from "@/lib/fund-data";

interface SearchBarProps {
  onSelectFund: (fund: FundInfo) => void;
  onOpenScreenshot: () => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onSelectFund, onOpenScreenshot }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FundInfo[]>([]);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = (value: string) => {
    setQuery(value);
    const found = searchFunds(value);
    setResults(found);
    setShowResults(value.length > 0);
  };

  const handleSelect = (fund: FundInfo) => {
    onSelectFund(fund);
    setQuery("");
    setShowResults(false);
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 rounded-lg bg-card border border-border p-1">
        <div className="flex items-center flex-1 gap-2 px-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
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

      {showResults && query && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card rounded-lg border border-border shadow-lg z-50 p-4 text-center text-sm text-muted-foreground">
          未找到相关基金
        </div>
      )}
    </div>
  );
};

export default SearchBar;
