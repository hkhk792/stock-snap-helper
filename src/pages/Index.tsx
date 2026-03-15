import React, { useState } from "react";
import { BarChart3, TrendingUp } from "lucide-react";
import SearchBar from "@/components/SearchBar";
import FundCard from "@/components/FundCard";
import HoldingsEditor from "@/components/HoldingsEditor";
import ScreenshotModal from "@/components/ScreenshotModal";
import { type FundInfo, type Holding } from "@/lib/fund-data";

interface TrackedFund {
  fund: FundInfo;
  holdings: Holding[];
}

const Index = () => {
  const [trackedFunds, setTrackedFunds] = useState<TrackedFund[]>([]);
  const [selectedFundCode, setSelectedFundCode] = useState<string | null>(null);
  const [screenshotOpen, setScreenshotOpen] = useState(false);

  const handleSelectFund = (fund: FundInfo) => {
    if (!trackedFunds.find((t) => t.fund.code === fund.code)) {
      setTrackedFunds((prev) => [...prev, { fund, holdings: [] }]);
    }
    setSelectedFundCode(fund.code);
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
            <div>
              <h1 className="text-base font-bold text-foreground tracking-tight">FundVision</h1>
              <p className="text-xs text-muted-foreground">基金净值实时估算</p>
            </div>
          </div>
          <SearchBar
            onSelectFund={handleSelectFund}
            onOpenScreenshot={() => setScreenshotOpen(true)}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {selectedFundCode && selectedTracked ? (
          <HoldingsEditor
            fund={selectedTracked.fund}
            holdings={selectedTracked.holdings}
            onUpdateHoldings={(h) => handleUpdateHoldings(selectedFundCode, h)}
            onBack={() => setSelectedFundCode(null)}
          />
        ) : (
          <div className="space-y-4">
            {trackedFunds.length > 0 && (
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                跟踪基金 ({trackedFunds.length})
              </h2>
            )}

            {trackedFunds.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="p-4 rounded-full bg-accent mb-4">
                  <TrendingUp className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-2">开始追踪基金</h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                  通过上方搜索栏搜索基金，或使用截图识别功能快速导入持仓数据，实时估算基金净值
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {trackedFunds.map((tracked) => (
                  <FundCard
                    key={tracked.fund.code}
                    fund={tracked.fund}
                    holdings={tracked.holdings}
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
      <ScreenshotModal
        open={screenshotOpen}
        onClose={() => setScreenshotOpen(false)}
        onImportHoldings={handleImportHoldings}
      />
    </div>
  );
};

export default Index;
