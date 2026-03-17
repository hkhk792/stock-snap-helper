import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, FolderOpen, Trash2 } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { AuthButton } from "@/components/AuthButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { createPortfolio, deletePortfolio, listPortfolios, type Portfolio } from "@/lib/portfolio-store";

export default function Portfolios() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const canUse = useMemo(() => !loading && !!user, [loading, user]);

  const refresh = async () => {
    if (!user) return;
    try {
      const data = await listPortfolios();
      setPortfolios(data);
    } catch (e: any) {
      toast.error(e?.message || "加载组合失败");
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleCreate = async () => {
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const p = await createPortfolio({ user_id: user.id, name: trimmed, base_nav: 1 });
      toast.success("已创建组合");
      setName("");
      await refresh();
      navigate(`/portfolios/${p.id}`);
    } catch (e: any) {
      toast.error(e?.message || "创建失败");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePortfolio(id);
      toast.success("已删除");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "删除失败");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary">
              <FolderOpen className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground tracking-tight">我的组合</h1>
              <p className="text-xs text-muted-foreground">登录后可保存并跨设备查看</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild className="h-8 text-xs">
              <Link to="/">返回首页</Link>
            </Button>
            <AuthButton />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {!canUse ? (
          <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">
            请先登录后再创建/保存组合。
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">新建组合</h2>
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：我的持仓组合"
              />
              <Button onClick={handleCreate} disabled={!name.trim() || creating}>
                <Plus className="h-4 w-4 mr-1" />
                创建
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            组合列表 ({portfolios.length})
          </h2>

          {portfolios.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
              还没有组合。创建一个开始吧。
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {portfolios.map((p) => (
                <div key={p.id} className="bg-card border border-border rounded-lg p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        更新于: {new Date(p.updated_at).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                      aria-label="删除组合"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-4">
                    <Button asChild className="w-full">
                      <Link to={`/portfolios/${p.id}`}>打开</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

