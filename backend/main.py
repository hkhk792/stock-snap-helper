import os
import re
import io
from typing import List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import time

try:
    import akshare as ak
except Exception:  # pragma: no cover
    ak = None

try:
    from PIL import Image
    import pytesseract
except Exception:  # pragma: no cover
    Image = None
    pytesseract = None


APP_NAME = os.getenv("APP_NAME", "realvalue-backend")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

app = FastAPI(title=APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Quote(BaseModel):
    code: str
    name: str
    price: float
    changePercent: float


class OcrHolding(BaseModel):
    name: str
    code: str
    weight: float


class OcrResult(BaseModel):
    text: str
    holdings: List[OcrHolding]


@app.get("/health")
def health():
    return {"ok": True, "name": APP_NAME}


def _safe_float(s: str) -> Optional[float]:
    try:
        return float(s)
    except Exception:
        return None


def parse_holdings_from_text(text: str) -> List[OcrHolding]:
    """
    Best-effort parser for common Chinese brokerage/fund holdings screenshots.
    Looks for 6-digit codes and nearby weight percentages.
    """
    holdings: List[OcrHolding] = []
    seen = set()

    # Normalize spaces
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines() if ln.strip()]

    # Patterns:
    # - "贵州茅台 600519 8.50%"
    # - "600519 贵州茅台 8.5"
    code_re = re.compile(r"\b(\d{6})\b")
    weight_re = re.compile(r"(\d{1,2}(?:\.\d{1,2})?)\s*%")

    for ln in lines:
        m_code = code_re.search(ln)
        if not m_code:
            continue
        code = m_code.group(1)

        # Try get weight
        m_w = weight_re.search(ln)
        weight = _safe_float(m_w.group(1)) if m_w else None
        if weight is None:
            # fallback: last number in line as weight (common tables omit %)
            nums = re.findall(r"(\d{1,2}(?:\.\d{1,2})?)", ln)
            if nums:
                weight = _safe_float(nums[-1])

        if weight is None:
            continue

        # Name: remove code + weight fragment
        name = ln
        name = re.sub(r"\b" + re.escape(code) + r"\b", " ", name)
        name = re.sub(r"(\d{1,2}(?:\.\d{1,2})?)\s*%?", " ", name)
        name = re.sub(r"\s+", " ", name).strip()
        if not name:
            name = code

        key = (code, name)
        if key in seen:
            continue
        seen.add(key)
        holdings.append(OcrHolding(name=name, code=code, weight=float(weight)))

    # Keep top weights first
    holdings.sort(key=lambda h: h.weight, reverse=True)
    return holdings[:200]


@app.post("/api/ocr/holdings", response_model=OcrResult)
async def ocr_holdings(file: UploadFile = File(...)):
    if Image is None or pytesseract is None:
        raise HTTPException(status_code=500, detail="OCR dependencies not installed (pillow/pytesseract).")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file.")

    raw = await file.read()
    try:
        img = Image.open(io.BytesIO(raw))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")

    # OCR: Chinese + English if available
    try:
        text = pytesseract.image_to_string(img, lang="chi_sim+eng")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR failed: {e}")

    holdings = parse_holdings_from_text(text)
    return OcrResult(text=text, holdings=holdings)


@app.get("/api/quotes", response_model=List[Quote])
def quotes(codes: str):
    if ak is None:
        raise HTTPException(status_code=500, detail="AKShare is not installed.")

    code_list = [c.strip() for c in codes.split(",") if c.strip()]
    if not code_list:
        return []

    try:
        df = ak.stock_zh_a_spot_em()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AKShare error: {e}")

    # Normalize columns (AKShare columns can vary; handle common names)
    # Expected: 代码, 名称, 最新价, 涨跌幅
    col_code = next((c for c in df.columns if str(c) in ["代码", "股票代码"]), None)
    col_name = next((c for c in df.columns if str(c) in ["名称", "股票简称"]), None)
    col_price = next((c for c in df.columns if str(c) in ["最新价", "最新"]), None)
    col_chg = next((c for c in df.columns if str(c) in ["涨跌幅", "涨跌幅%"]), None)

    if not all([col_code, col_name, col_price, col_chg]):
        raise HTTPException(status_code=500, detail=f"Unexpected AKShare dataframe columns: {list(df.columns)}")

    df = df[[col_code, col_name, col_price, col_chg]].copy()
    df.columns = ["code", "name", "price", "changePercent"]

    df["code"] = df["code"].astype(str).str.zfill(6)
    df = df[df["code"].isin(code_list)]

    out: List[Quote] = []
    for _, row in df.iterrows():
        out.append(
            Quote(
                code=str(row["code"]),
                name=str(row["name"]),
                price=float(row["price"]) if row["price"] is not None else 0.0,
                changePercent=float(row["changePercent"]) if row["changePercent"] is not None else 0.0,
            )
        )

    # Preserve order of input codes if possible
    out_map = {q.code: q for q in out}
    return [out_map[c] for c in code_list if c in out_map]


_indices_cache = {"ts": 0.0, "data": None}


@app.get("/api/indices")
def indices():
    """
    Global/major indices snapshot.
    - China indices: via AKShare stock_zh_index_spot_em (fast)
    - Others: best-effort via investing global daily last 2 points (compute %)
    Cached for 60 seconds to reduce upstream load.
    """
    now = time.time()
    if _indices_cache["data"] is not None and now - _indices_cache["ts"] < 60:
        return _indices_cache["data"]

    out = []

    if ak is not None:
        try:
            df = ak.stock_zh_index_spot_em(symbol="沪深重要指数")
            # columns: 代码, 名称, 最新价, 涨跌幅
            cols = list(df.columns)
            col_code = next((c for c in cols if str(c) in ["代码", "指数代码"]), None)
            col_name = next((c for c in cols if str(c) in ["名称", "指数名称"]), None)
            col_price = next((c for c in cols if "最新" in str(c)), None)
            col_chg = next((c for c in cols if "涨跌幅" in str(c)), None)
            if all([col_code, col_name, col_price, col_chg]):
                df2 = df[[col_code, col_name, col_price, col_chg]].copy()
                df2.columns = ["code", "name", "price", "changePercent"]
                keep = {"000001", "399001", "399006", "000300"}
                for _, r in df2[df2["code"].astype(str).isin(keep)].iterrows():
                    out.append(
                        {
                            "code": str(r["code"]),
                            "name": str(r["name"]),
                            "price": float(r["price"]) if r["price"] is not None else 0.0,
                            "changePercent": float(r["changePercent"]) if r["changePercent"] is not None else 0.0,
                        }
                    )
        except Exception:
            pass

        # Best-effort: investing global daily last two
        try:
            global_targets = [
                ("美国", "标普500"),
                ("美国", "纳斯达克综合指数"),
                ("美国", "道琼斯工业平均指数"),
                ("日本", "日经225"),
                ("中国香港", "恒生指数"),
            ]
            for country, index_name in global_targets:
                try:
                    df = ak.index_investing_global(
                        country=country,
                        index_name=index_name,
                        period="每日",
                        start_date="2020-01-01",
                        end_date=time.strftime("%Y-%m-%d"),
                    )
                    if df is None or df.empty:
                        continue
                    close = df["收盘"].tail(2).tolist()
                    if len(close) < 2:
                        continue
                    last, prev = float(close[-1]), float(close[-2])
                    chg = (last / prev - 1) * 100 if prev else 0.0
                    out.append({"code": f"{country}:{index_name}", "name": index_name, "price": last, "changePercent": chg})
                except Exception:
                    continue
        except Exception:
            pass

    _indices_cache["ts"] = now
    _indices_cache["data"] = out
    return out


@app.get("/api/fund/search")
def fund_search(keyword: str):
    if ak is None:
        raise HTTPException(status_code=500, detail="AKShare is not installed.")
    kw = (keyword or "").strip()
    if not kw:
        return []
    try:
        df = ak.fund_name_em()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AKShare error: {e}")

    # Expected columns: 基金代码, 拼音缩写, 基金简称, 基金类型, 拼音全称
    cols = list(df.columns)
    col_code = next((c for c in cols if str(c) in ["基金代码", "代码"]), None)
    col_spell = next((c for c in cols if "拼音缩写" in str(c)), None)
    col_name = next((c for c in cols if "基金简称" in str(c) or "基金名称" in str(c)), None)
    col_type = next((c for c in cols if "基金类型" in str(c)), None)
    if not all([col_code, col_name, col_type]):
        raise HTTPException(status_code=500, detail=f"Unexpected fund_name_em columns: {cols}")

    df = df[[col_code, col_name, col_type] + ([col_spell] if col_spell else [])].copy()
    df.columns = ["code", "name", "type"] + (["spell"] if col_spell else [])

    kw_lower = kw.lower()
    mask = (
        df["code"].astype(str).str.contains(kw, na=False)
        | df["name"].astype(str).str.contains(kw, na=False)
    )
    if "spell" in df.columns:
        mask = mask | df["spell"].astype(str).str.lower().str.contains(kw_lower, na=False)

    out = []
    for _, r in df[mask].head(20).iterrows():
        out.append(
            {
                "code": str(r["code"]),
                "name": str(r["name"]),
                "type": str(r["type"]),
                "spell": str(r["spell"]) if "spell" in df.columns else None,
            }
        )
    return out


@app.get("/api/fund/estimate")
def fund_estimate(code: str):
    """
    Real-time estimate endpoint (fundgz) for open-end funds.
    AKShare does not consistently expose the same 'gsz' interface, so we use the upstream directly.
    """
    c = (code or "").strip()
    if not c:
        return None
    url = f"https://fundgz.1234567.com.cn/js/{c}.js"
    try:
        res = requests.get(url, headers={"Referer": "https://fund.eastmoney.com/"}, timeout=10)
        res.raise_for_status()
        text = res.text
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upstream error: {e}")

    m = re.sub(r"^jsonpgz\(", "", text)
    m = re.sub(r"\);?\s*$", "", m)
    try:
        data = __import__("json").loads(m)
    except Exception:
        return None

    def f(x):
        try:
            return float(x)
        except Exception:
            return 0.0

    return {
        "code": data.get("fundcode", c),
        "name": data.get("name", ""),
        "lastNav": f(data.get("dwjz")),
        "lastNavDate": data.get("jzrq", ""),
        "estimatedNav": f(data.get("gsz")),
        "estimatedChange": f(data.get("gszzl")),
        "estimatedTime": data.get("gztime", ""),
    }


@app.get("/api/fund/holdings")
def fund_holdings(code: str):
    """
    Best-effort top holdings parser from EastMoney pingzhongdata JS.
    Returns {holdings:[{name,code?,weight}], stockCodes:[...]} to match existing frontend.
    """
    c = (code or "").strip()
    if not c:
        return {"holdings": [], "stockCodes": []}

    url = f"https://fund.eastmoney.com/pingzhongdata/{c}.js"
    try:
        res = requests.get(url, headers={"Referer": "https://fund.eastmoney.com/"}, timeout=10)
        res.raise_for_status()
        text = res.text
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upstream error: {e}")

    stock_codes = []
    m_stock = re.search(r'var stockCodesNew="([^"]+)"', text)
    if m_stock:
        stock_codes = [s for s in m_stock.group(1).split(",") if s]

    holdings = []
    # currentStockList is JSON array of objects with GPJC/GPDM/JZBL in many funds
    m_list = re.search(r"var currentStockList=(\[[\s\S]*?\]);", text)
    if m_list:
        try:
            arr = __import__("json").loads(m_list.group(1))
            for item in arr:
                holdings.append(
                    {
                        "name": item.get("GPJC") or item.get("gp") or "",
                        "code": item.get("GPDM") or "",
                        "weight": float(item.get("JZBL") or 0),
                    }
                )
        except Exception:
            holdings = []

    # fallback to fund_positions
    if not holdings:
        m_pos = re.search(r"var fund_positions=(\[[\s\S]*?\]);", text)
        if m_pos:
            try:
                arr = __import__("json").loads(m_pos.group(1))
                for pos in arr:
                    holdings.append(
                        {
                            "name": pos[0] or "",
                            "weight": float(pos[1] or 0),
                        }
                    )
            except Exception:
                holdings = []

    return {"holdings": holdings, "stockCodes": stock_codes}

