const CursorHome = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 backdrop-blur p-10 shadow-2xl shadow-black/40 text-center">
          <h1 className="text-4xl font-bold tracking-tight">我的第一个 Cursor 项目</h1>
          <p className="mt-4 text-sm text-white/70">
            这是一个用 Tailwind CSS 构建的极简个人主页示例。
          </p>

          <div className="mt-8 flex items-center justify-center gap-3 text-xs text-white/60">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            <span>访问路径：/cursor-home</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CursorHome;

