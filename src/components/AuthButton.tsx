
import { useMemo, useState, useEffect } from "react";
import { LogIn, LogOut, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function AuthButton() {
  const { user, loading: sessionLoading } = useSession();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const userLabel = useMemo(() => {
    if (!user) return "";
    return user.email || user.phone || user.id.slice(0, 8);
  }, [user]);

  // Reset form when dialog is closed or mode changes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setMode('signIn');
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setLoading(false);
      }, 200);
    }
  }, [open]);

  const handleSignUp = async () => {
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) throw error;
      toast.success("Sign up successful! Please check your email to verify.");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      toast.success("Login successful");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Invalid login credentials");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
  };

  if (sessionLoading) {
    return (
      <Button variant="outline" size="sm" disabled className="h-8 text-xs">
        <User className="h-3.5 w-3.5 mr-1" />
        Loading...
      </Button>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline text-xs text-muted-foreground max-w-[220px] truncate">
          {userLabel}
        </span>
        <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="h-8 text-xs"
          >
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
          Login
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'signIn' ? "登录以保存持仓" : "创建新账户"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="邮箱地址"
            type="email"
            autoFocus
            disabled={loading}
          />
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            type="password"
            disabled={loading}
          />
          {mode === 'signUp' && (
            <Input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="确认密码"
              type="password"
              disabled={loading}
            />
          )}
        </div>
        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between sm:space-x-2">
            <Button
                variant="link"
                className="text-xs p-0 h-auto"
                onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
                disabled={loading}
            >
                {mode === 'signIn' ? "还没有账户？立即注册" : "已有账户？直接登录"}
            </Button>
            <Button
                onClick={mode === 'signIn' ? handleSignIn : handleSignUp}
                disabled={loading || !email || !password || (mode === 'signUp' && !confirmPassword)}
            >
                {loading ? (mode === 'signIn' ? "登录中..." : "注册中...") : (mode === 'signIn' ? "登录" : "创建账户")}}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
