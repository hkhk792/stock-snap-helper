import { useMemo, useState, useEffect } from "react";
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
  const [verificationCode, setVerificationCode] = useState("");
  const [step, setStep] = useState<'email' | 'code'>('email'); // 'email' or 'code'
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const userLabel = useMemo(() => {
    if (!user) return "";
    return user.email || user.phone || user.id.slice(0, 8);
  }, [user]);

  const handleSendCode = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      // 使用Supabase的OTP功能发送验证码
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: undefined, // 不使用Magic Link
        },
      });
      if (error) throw error;
      toast.success("验证码已发送到邮箱");
      setStep('code');
      setVerificationCode("");
    } catch (e: any) {
      toast.error(e?.message || "发送验证码失败");
    } finally {
      setSending(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      toast.error("请输入验证码");
      return;
    }
    setVerifying(true);
    try {
      // 验证OTP
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: verificationCode,
        type: 'email',
      });
      if (error) throw error;
      toast.success("登录成功");
      setOpen(false);
      setEmail("");
      setVerificationCode("");
      setStep('email');
    } catch (e: any) {
      toast.error(e?.message || "验证码错误或已过期");
    } finally {
      setVerifying(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("已退出登录");
  };



  useEffect(() => {
    if (!open) {
      setEmail("");
      setVerificationCode("");
      setStep('email');
    }
  }, [open]);

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
          {step === 'email' ? (
            <>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="请输入邮箱"
                type="email"
                autoFocus
                disabled={sending}
              />
              <Button onClick={handleSendCode} disabled={!email.trim() || sending} className="w-full">
                {sending ? "发送中…" : "发送验证码"}
              </Button>
              <p className="text-xs text-muted-foreground">
                我们会发送一个6位验证码到你的邮箱。登录后可跨设备保存你的组合持仓。
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">验证码已发送到 {email}</p>
              <Input
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="请输入6位验证码"
                maxLength={6}
                autoFocus
                disabled={verifying}
              />
              <Button onClick={handleVerifyCode} disabled={verificationCode.length !== 6 || verifying} className="w-full">
                {verifying ? "验证中…" : "验证并登录"}
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  setStep('email');
                  setVerificationCode("");
                }}
                className="w-full"
                disabled={verifying}
              >
                返回修改邮箱
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

