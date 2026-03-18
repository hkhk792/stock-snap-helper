import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, BarChart, Bar, XAxis, YAxis } from "recharts";
import { type Holding } from "@/lib/fund-data";

const COLORS = ["#22c55e", "#3b82f6", "#a855f7", "#f97316", "#06b6d4", "#eab308", "#ef4444", "#64748b"];

function fmtMoney(v: number) {
  if (!Number.isFinite(v)) return "-";
  return `¥ ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function PortfolioCharts({ holdings }: { holdings: Holding[] }) {
  const bySector = useMemo(() => {
    const map = new Map<string, number>();
    holdings.forEach((h) => {
      const sector = (h.sector || "未分类").trim() || "未分类";
      map.set(sector, (map.get(sector) || 0) + Number(h.buyAmount || 0));
    });
    const arr = Array.from(map.entries()).map(([name, value]) => ({ name, value }));
    arr.sort((a, b) => b.value - a.value);
    return arr.slice(0, 8);
  }, [holdings]);

  const topHoldings = useMemo(() => {
    const arr = holdings
      .map((h) => ({
        name: (h.alias || h.name || h.code || "—").slice(0, 12),
        amount: Number(h.buyAmount || 0),
        pnl: Number(h.buyAmount || 0) * (Number(h.change || 0) / 100),
      }))
      .filter((x) => x.amount > 0);
    arr.sort((a, b) => b.amount - a.amount);
    return arr.slice(0, 10);
  }, [holdings]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="text-sm font-semibold text-foreground">行业分布（按投入金额）</div>
        <div className="text-xs text-muted-foreground mt-1">Top 8 行业</div>
        <div className="mt-4 h-64">
          {bySector.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={bySector} dataKey="value" nameKey="name" outerRadius={95} innerRadius={55}>
                  {bySector.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <ReTooltip formatter={(v: any, n: any) => [fmtMoney(Number(v)), n]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        {bySector.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {bySector.map((s, i) => (
              <div key={s.name} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="truncate text-muted-foreground">{s.name}</span>
                </div>
                <span className="tabular-nums text-foreground">{fmtMoney(s.value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="text-sm font-semibold text-foreground">Top 持仓（按投入金额）</div>
        <div className="text-xs text-muted-foreground mt-1">Top 10</div>
        <div className="mt-4 h-64">
          {topHoldings.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topHoldings} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} height={50} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 10000 ? `${Math.round(v / 1000) / 10}万` : v)} />
                <ReTooltip
                  formatter={(v: any, n: any, p: any) => {
                    if (n === "amount") return [fmtMoney(Number(v)), "投入金额"];
                    if (n === "pnl") return [`${Number(v) >= 0 ? "+" : ""}${fmtMoney(Math.abs(Number(v)))}`, "预估盈亏"];
                    return [String(v), String(n)];
                  }}
                />
                <Bar dataKey="amount" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

