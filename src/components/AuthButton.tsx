import { useMemo, useState } from "react";
import { LogIn, LogOut, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function AuthButton() {
  const { user, loading } = useSession();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const userLabel = useMemo(() => {
    if (!user) return "";
    return user.email || user.phone || user.id.slice(0, 8);
  }, [user]);

  const handleSendLink = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      toast.success("登录链接已发送到邮箱");
      setOpen(false);
      setEmail("");
    } catch (e: any) {
      toast.error(e?.message || "发送登录链接失败");
    } finally {
      setSending(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("已退出登录");
  };

  if (loading) {
    return (
      <Button variant="outline" size="sm" disabled className="h-8 text-xs">
        <User className="h-3.5 w-3.5 mr-1" />
        登录中…
      </Button>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline text-xs text-muted-foreground max-w-[220px] truncate">
          {userLabel}
        </span>
        <Button variant="outline" size="sm" onClick={handleSignOut} className="h-8 text-xs">
          <LogOut className="h-3.5 w-3.5 mr-1" />
          退出
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 text-xs">
          <LogIn className="h-3.5 w-3.5 mr-1" />
          登录
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>登录以保存持仓</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="请输入邮箱"
            type="email"
            autoFocus
          />
          <Button onClick={handleSendLink} disabled={!email.trim() || sending} className="w-full">
            {sending ? "发送中…" : "发送登录链接"}
          </Button>
          <p className="text-xs text-muted-foreground">
            我们会发送一个一次性登录链接到你的邮箱（Magic Link）。登录后可跨设备保存你的组合持仓。
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

