import { useEffect, useState } from "react";
import { Globe, TrendingDown, TrendingUp } from "lucide-react";
import { getGlobalIndices, type StockQuote } from "@/lib/fund-api";
import { Skeleton } from "@/components/ui/skeleton";

export function GlobalIndices() {
  const [data, setData] = useState<StockQuote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      const d = await getGlobalIndices();
      setData(d);
    } catch (e: any) {
      setError("全球指数暂不可用");
      setData(null);
    }
  };

  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary">
            <Globe className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">全球大盘指数</div>
            <div className="text-xs text-muted-foreground">每分钟刷新</div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="text-sm text-muted-foreground">{error}</div>
      ) : !data ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <Skeleton className="h-4 w-24" />
              <div className="mt-2 flex items-end justify-between gap-2">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-12" />
              </div>
            </div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="text-sm text-muted-foreground">暂无数据</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {data.slice(0, 12).map((idx) => {
            const up = idx.changePercent >= 0;
            return (
              <div key={idx.code} className="rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors">
                <div className="text-xs text-muted-foreground truncate">{idx.name}</div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div className="text-lg font-bold tabular-nums text-foreground">
                    {Number.isFinite(idx.price) ? idx.price.toLocaleString() : "-"}
                  </div>
                  <div
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold ${
                      up ? "bg-gain-light text-gain" : "bg-loss-light text-loss"
                    }`}
                  >
                    {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {up ? "+" : ""}
                    {idx.changePercent.toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

