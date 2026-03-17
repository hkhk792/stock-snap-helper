import React, { useState, useRef } from "react";
import { Upload, X, FileImage, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Holding } from "@/lib/fund-data";
import { backendOcrHoldings } from "@/lib/backend-api";
import { toast } from "sonner";

interface ScreenshotModalProps {
  open: boolean;
  onClose: () => void;
  onImportHoldings: (holdings: Holding[]) => void;
}

const ScreenshotModal: React.FC<ScreenshotModalProps> = ({ open, onClose, onImportHoldings }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [parsedHoldings, setParsedHoldings] = useState<Holding[]>([]);
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageUrl(url);
      setParsing(true);
      backendOcrHoldings(file)
        .then((res) => {
          const hs: Holding[] = (res.holdings || []).map((h) => ({
            id: crypto.randomUUID(),
            name: h.name || "",
            code: h.code || "",
            weight: Number(h.weight || 0),
            change: 0,
          }));
          setParsedHoldings(hs);
          toast.success(`已解析 ${hs.length} 条持仓（可继续校对）`);
        })
        .catch((err: any) => {
          console.error("OCR failed:", err);
          toast.error("截图识别失败，请检查后端服务是否已启动");
          setParsedHoldings([]);
        })
        .finally(() => setParsing(false));
    }
  };

  const updateParsed = (id: string, field: keyof Holding, value: string | number) => {
    setParsedHoldings((prev) =>
      prev.map((h) => (h.id === id ? { ...h, [field]: value } : h))
    );
  };

  const removeParsed = (id: string) => {
    setParsedHoldings((prev) => prev.filter((h) => h.id !== id));
  };

  const addParsed = () => {
    setParsedHoldings((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", code: "", weight: 0, change: 0 },
    ]);
  };

  const handleImport = () => {
    onImportHoldings(parsedHoldings.filter((h) => h.name && h.weight > 0));
    setImageUrl(null);
    setParsedHoldings([]);
    onClose();
  };

  const handleReset = () => {
    setImageUrl(null);
    setParsedHoldings([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40">
      <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">截图识别持仓</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Image Upload */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">持仓截图</h3>
              {imageUrl ? (
                <div className="relative rounded-lg overflow-hidden border border-border">
                  <img src={imageUrl} alt="持仓截图" className="w-full object-contain max-h-80" />
                  <button
                    onClick={handleReset}
                    className="absolute top-2 right-2 p-1.5 rounded-md bg-card/80 hover:bg-card transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-64 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-3 hover:border-primary hover:bg-accent/50 transition-colors"
                >
                  <div className="p-3 rounded-full bg-accent">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">点击上传持仓截图</p>
                    <p className="text-xs text-muted-foreground mt-1">支持 JPG、PNG 格式</p>
                  </div>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                <FileImage className="h-3.5 w-3.5" />
                {parsing ? "正在识别中…" : "上传截图后将自动解析持仓数据"}
              </p>
            </div>

            {/* Right: Parsed Data */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-foreground">解析结果</h3>
                {parsedHoldings.length > 0 && (
                  <Button size="sm" variant="outline" onClick={addParsed} className="h-7 text-xs">
                    <Plus className="h-3 w-3 mr-1" />
                    添加
                  </Button>
                )}
              </div>

              {parsedHoldings.length === 0 ? (
                <div className="h-64 border border-border rounded-lg flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    {parsing ? "识别中，请稍候…" : "请先上传截图"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-auto">
                  <div className="grid grid-cols-12 gap-1.5 text-xs font-medium text-muted-foreground px-1">
                    <div className="col-span-4">名称</div>
                    <div className="col-span-3">代码</div>
                    <div className="col-span-2">占比%</div>
                    <div className="col-span-2">涨跌%</div>
                    <div className="col-span-1"></div>
                  </div>
                  {parsedHoldings.map((h) => (
                    <div key={h.id} className="grid grid-cols-12 gap-1.5 items-center">
                      <div className="col-span-4">
                        <Input value={h.name} onChange={(e) => updateParsed(h.id, "name", e.target.value)} className="h-7 text-xs" />
                      </div>
                      <div className="col-span-3">
                        <Input value={h.code} onChange={(e) => updateParsed(h.id, "code", e.target.value)} className="h-7 text-xs" />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" value={h.weight || ""} onChange={(e) => updateParsed(h.id, "weight", parseFloat(e.target.value) || 0)} className="h-7 text-xs tabular-nums" />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" value={h.change || ""} onChange={(e) => updateParsed(h.id, "change", parseFloat(e.target.value) || 0)} className="h-7 text-xs tabular-nums" />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <button onClick={() => removeParsed(h.id)} className="p-1 rounded hover:bg-muted">
                          <Trash2 className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleImport} disabled={parsedHoldings.length === 0 || parsing}>
            导入持仓数据
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ScreenshotModal;
