import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";
import { AuthButton } from "@/components/AuthButton";
import HoldingsEditor from "@/components/HoldingsEditor";
import { PortfolioCharts } from "@/components/PortfolioCharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStockQuotes } from "@/lib/fund-api";
import { supabase } from "@/integrations/supabase/client";
import { type Holding } from "@/lib/fund-data";
import { getPortfolio, listHoldings, logOcrImport, renamePortfolio, replaceHoldings } from "@/lib/portfolio-store";

export default function PortfolioDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading } = useSession();

  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const autoSaveTimer = useRef<number | null>(null);

  const canUse = useMemo(() => !loading && !!user, [loading, user]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [p, hs] = await Promise.all([getPortfolio(id), listHoldings(id)]);
      setName(p.name);
      setOwnerName((p as any).owner_name ?? "");
      setHoldings(
        hs.map((h) => ({
          id: h.id,
          name: h.name,
          code: h.code,
          alias: (h as any).alias ?? "",
          sector: (h as any).sector ?? "",
          weight: Number(h.weight),
          change: 0,
          buyAmount: Number((h as any).buy_amount ?? 0),
          buyPrice: Number((h as any).buy_price ?? 0),
          shares: Number((h as any).shares ?? 0),
        })),
      );
    } catch (e: any) {
      toast.error(e?.message || "加载失败");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await renamePortfolio(id, name.trim() || "未命名组合");
      // Update owner name if provided
      await supabase.from("portfolios").update({ owner_name: ownerName }).eq("id", id);
      await replaceHoldings(
        id,
        holdings.map((h) => ({
          id: h.id,
          name: h.name,
          code: h.code,
          weight: h.weight,
          alias: h.alias ?? "",
          buy_amount: h.buyAmount ?? 0,
          buy_price: h.buyPrice ?? 0,
          shares: h.shares ?? 0,
          sector: h.sector ?? "",
        })),
      );
      toast.success("已保存");
      setDirty(false);
    } catch (e: any) {
      toast.error(e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  // Auto-save (debounced) to avoid losing edits
  useEffect(() => {
    if (!id) return;
    if (!dirty) return;
    if (saving) return;

    if (autoSaveTimer.current) {
      window.clearTimeout(autoSaveTimer.current);
    }

    autoSaveTimer.current = window.setTimeout(() => {
      handleSave();
    }, 1200);

    return () => {
      if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, name, holdings]);

  const refreshQuotes = async () => {
    setRefreshing(true);
    try {
      const codes = Array.from(new Set(holdings.map((h) => h.code).filter(Boolean)));
      const quotes = await getStockQuotes(codes);
      const map = new Map<string, number>();
      quotes.forEach((q) => {
        map.set(q.code, q.changePercent);
        map.set(q.name, q.changePercent);
      });

      setHoldings((prev) =>
        prev.map((h) => ({
          ...h,
          change: map.get(h.code) ?? map.get(h.name) ?? 0,
        })),
      );
      toast.success("已刷新行情");
    } catch (e: any) {
      toast.error(e?.message || "刷新失败");
    } finally {
      setRefreshing(false);
    }
  };

  if (!canUse) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-card border-b border-border sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <Button variant="outline" size="sm" asChild className="h-8 text-xs">
              <Link to="/portfolios">返回组合</Link>
            </Button>
            <AuthButton />
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-10">
          <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">
            请先登录后再编辑/保存组合。
          </div>
        </main>
      </div>
    );
  }

  if (!id) {
    navigate("/portfolios");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild className="h-8 text-xs">
              <Link to="/portfolios">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                返回
              </Link>
            </Button>
            <div className="hidden sm:block text-xs text-muted-foreground">组合 ID: {id.slice(0, 8)}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refreshQuotes} disabled={refreshing} className="h-8 text-xs">
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              {refreshing ? "刷新中…" : "刷新行情"}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-8 text-xs">
              <Save className="h-3.5 w-3.5 mr-1" />
              {saving ? "保存中…" : "保存"}
            </Button>
            <AuthButton />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-2">组合名称</div>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
                placeholder="未命名组合"
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-2">持仓人/备注名</div>
              <Input
                value={ownerName}
                onChange={(e) => {
                  setOwnerName(e.target.value);
                  setDirty(true);
                }}
                placeholder="例如：胡肖建"
              />
            </div>
          </div>
        </div>

        <PortfolioCharts holdings={holdings} />

        <HoldingsEditor
          fund={{ code: id, name: name || "未命名组合", type: "自定义组合" }}
          estimate={null}
          holdings={holdings}
          onUpdateHoldings={(hs) => {
            setHoldings(hs);
            setDirty(true);
          }}
          onBack={() => navigate("/portfolios")}
          onRefresh={refreshQuotes}
        />
      </main>

      {/* Screenshot modal removed */}
    </div>
  );
}

