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
except Exception:
    ak = None

try:
    from PIL import Image
    import pytesseract
except Exception:
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
    holdings: List[OcrHolding] = []
    seen = set()

    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines() if ln.strip()]

    code_re = re.compile(r"\b(\d{6})\b")
    weight_re = re.compile(r"(\d{1,2}(?:\.\d{1,2})?)\s*%")

    for ln in lines:
        m_code = code_re.search(ln)
        if not m_code:
            continue
        code = m_code.group(1)

        m_w = weight_re.search(ln)
        weight = _safe_float(m_w.group(1)) if m_w else None
        if weight is None:
            nums = re.findall(r"(\d{1,2}(?:\.\d{1,2})?)", ln)
            if nums:
                weight = _safe_float(nums[-1])

        if weight is None:
            continue

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

    out_map = {q.code: q for q in out}
    return [out_map[c] for c in code_list if c in out_map]


_indices_cache = {"ts": 0.0, "data": None}


def _yahoo_global_indices() -> list:
    """
    使用 Yahoo Finance API 获取全球指数
    """
    targets = [
        ("%5EGSPC", "标普500"),
        ("%5EIXIC", "纳斯达克"),
        ("%5EDJI", "道琼斯"),
        ("%5EN225", "日经225"),
        ("%5EHSI", "恒生指数"),
        ("%5EFCHI", "法国CAC40"),
        ("%5EGDAXI", "德国DAX"),
        ("%5EFTSE", "英国富时100"),
        ("%5EAXJO", "澳洲ASX200"),
        ("%5EKS11", "韩国KOSPI"),
        ("%5ETWII", "台湾加权"),
        ("%5ESTI", "新加坡海峡时报"),
        ("%5EBSESN", "印度Sensex"),
        ("%5EBVSP", "巴西IBOVESPA"),
        ("%5EGSPTSE", "加拿大TSX"),
        ("%5EMXX", "墨西哥IPC"),
        ("%5ERTS", "俄罗斯RTS"),
    ]
    url = "https://query1.finance.yahoo.com/v7/finance/quote"
    symbols = ",".join([s for s, _ in targets])
    try:
        r = requests.get(
            url,
            params={"symbols": symbols},
            headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json,text/plain,*/*",
            },
            timeout=10,
        )
        r.raise_for_status()
        js = r.json()
    except Exception:
        return []

    result = js.get("quoteResponse", {}).get("result", []) or []
    by_symbol = {str(it.get("symbol", "")).upper(): it for it in result}

    out = []
    for sym, name in targets:
        key = sym.replace("%5E", "^").upper()
        it = by_symbol.get(key)
        if not it:
            continue
        price = it.get("regularMarketPrice")
        chg = it.get("regularMarketChangePercent")
        if price is None or chg is None:
            continue
        out.append(
            {
                "code": key,
                "name": name,
                "price": float(price),
                "changePercent": float(chg),
            }
        )
    return out


@app.get("/api/indices")
def indices():
    """
    全球指数 - 使用 AKShare (中国) + Yahoo Finance (全球)
    """
    now = time.time()
    if _indices_cache["data"] is not None and now - _indices_cache["ts"] < 300:
        return _indices_cache["data"]

    out = []

    # 中国指数 - 使用 AKShare
    if ak is not None:
        try:
            df = ak.stock_zh_index_spot_em(symbol="沪深重要指数")
            cols = list(df.columns)
            col_code = next((c for c in cols if str(c) in ["代码", "指数代码"]), None)
            col_name = next((c for c in cols if str(c) in ["名称", "指数名称"]), None)
            col_price = next((c for c in cols if "最新" in str(c)), None)
            col_chg = next((c for c in cols if "涨跌幅" in str(c)), None)
            if all([col_code, col_name, col_price, col_chg]):
                df2 = df[[col_code, col_name, col_price, col_chg]].copy()
                df2.columns = ["code", "name", "price", "changePercent"]
                keep = {"000001", "399001", "399006", "000300", "000905"}
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

    # 全球指数 - 使用 Yahoo Finance
    out.extend(_yahoo_global_indices())

    if not out and _indices_cache["data"] is not None:
        return _indices_cache["data"]

    _indices_cache["ts"] = now
    _indices_cache["data"] = out
    return out


# 基金数据缓存
_fund_name_cache = {"ts": 0.0, "data": None}
_FUND_CACHE_DURATION = 3600  # 1小时


def _get_fund_name_df():
    """获取基金名称数据，带缓存"""
    now = time.time()
    if _fund_name_cache["data"] is not None and now - _fund_name_cache["ts"] < _FUND_CACHE_DURATION:
        return _fund_name_cache["data"]
    
    if ak is None:
        return None
    
    try:
        df = ak.fund_name_em()
        _fund_name_cache["ts"] = now
        _fund_name_cache["data"] = df
        return df
    except Exception:
        return None


@app.get("/api/fund/search")
def fund_search(keyword: str):
    """基金搜索 - 使用 AKShare"""
    if ak is None:
        raise HTTPException(status_code=500, detail="AKShare is not installed.")
    kw = (keyword or "").strip()
    if not kw:
        return []
    
    df = _get_fund_name_df()
    if df is None:
        return []

    cols = list(df.columns)
    col_code = next((c for c in cols if str(c) in ["基金代码", "代码"]), None)
    col_spell = next((c for c in cols if "拼音缩写" in str(c)), None)
    col_name = next((c for c in cols if "基金简称" in str(c) or "基金名称" in str(c)), None)
    col_type = next((c for c in cols if "基金类型" in str(c)), None)
    if not all([col_code, col_name, col_type]):
        return []

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
    基金估值 - 使用 AKShare
    """
    c = (code or "").strip()
    if not c:
        return None
    
    if ak is None:
        raise HTTPException(status_code=500, detail="AKShare is not installed.")
    
    try:
        # 使用 AKShare 获取基金实时估值
        df = ak.fund_etf_spot_em()
        
        # 查找对应基金
        col_code = next((col for col in df.columns if "代码" in str(col)), None)
        col_name = next((col for col in df.columns if "名称" in str(col)), None)
        col_price = next((col for col in df.columns if "最新价" in str(col) or "最新" in str(col)), None)
        col_chg = next((col for col in df.columns if "涨跌幅" in str(col)), None)
        
        if not all([col_code, col_price]):
            return None
        
        row = df[df[col_code].astype(str) == c]
        if row.empty:
            return None
        
        row = row.iloc[0]
        current_price = float(row[col_price]) if row[col_price] is not None else 0.0
        change_percent = float(row[col_chg]) if col_chg and row[col_chg] is not None else 0.0
        
        # 获取基金名称
        name = str(row[col_name]) if col_name else c
        
        return {
            "code": c,
            "name": name,
            "lastNav": current_price,
            "lastNavDate": time.strftime("%Y-%m-%d"),
            "estimatedNav": current_price,
            "estimatedChange": change_percent,
            "estimatedTime": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
    except Exception as e:
        # 如果 ETF 实时数据获取失败，尝试获取开放式基金数据
        try:
            df = ak.fund_open_fund_daily_em(symbol=c)
            if df is None or df.empty:
                return None
            
            # 获取最新数据
            latest = df.iloc[-1]
            col_nav = next((col for col in df.columns if "净值" in str(col)), None)
            col_date = next((col for col in df.columns if "日期" in str(col)), None)
            
            if col_nav is None:
                return None
            
            nav = float(latest[col_nav])
            date = str(latest[col_date]) if col_date else time.strftime("%Y-%m-%d")
            
            # 计算涨跌幅
            if len(df) >= 2:
                prev_nav = float(df.iloc[-2][col_nav])
                change_percent = ((nav - prev_nav) / prev_nav) * 100 if prev_nav else 0.0
            else:
                change_percent = 0.0
            
            return {
                "code": c,
                "name": c,
                "lastNav": nav,
                "lastNavDate": date,
                "estimatedNav": nav,
                "estimatedChange": change_percent,
                "estimatedTime": f"{date} 15:00:00",
            }
        except Exception:
            return None


@app.get("/api/fund/holdings")
def fund_holdings(code: str):
    """
    基金持仓 - 使用 AKShare
    """
    c = (code or "").strip()
    if not c:
        return {"holdings": [], "stockCodes": []}
    
    if ak is None:
        raise HTTPException(status_code=500, detail="AKShare is not installed.")
    
    holdings = []
    stock_codes = []
    
    try:
        # 尝试获取基金持仓数据
        df = ak.fund_portfolio_em(code=c, year=time.strftime("%Y"))
        if df is not None and not df.empty:
            # 查找股票持仓列
            col_name = next((col for col in df.columns if "股票" in str(col) or "名称" in str(col)), None)
            col_code = next((col for col in df.columns if "代码" in str(col)), None)
            col_weight = next((col for col in df.columns if "比例" in str(col) or "占比" in str(col)), None)
            
            if col_name:
                for _, row in df.head(20).iterrows():
                    name = str(row[col_name]) if col_name else ""
                    code_val = str(row[col_code]) if col_code else ""
                    weight = float(row[col_weight]) if col_weight and row[col_weight] is not None else 0.0
                    
                    if name:
                        holdings.append({
                            "name": name,
                            "code": code_val,
                            "weight": weight,
                        })
                        if code_val:
                            stock_codes.append(code_val)
    except Exception:
        pass
    
    # 如果上面方法失败，尝试其他方式
    if not holdings:
        try:
            # 尝试获取 ETF 持仓
            df = ak.fund_etf_portfolio_em(code=c)
            if df is not None and not df.empty:
                col_name = next((col for col in df.columns if "股票" in str(col) or "名称" in str(col)), None)
                col_code = next((col for col in df.columns if "代码" in str(col)), None)
                col_weight = next((col for col in df.columns if "比例" in str(col) or "占比" in str(col)), None)
                
                if col_name:
                    for _, row in df.head(20).iterrows():
                        name = str(row[col_name]) if col_name else ""
                        code_val = str(row[col_code]) if col_code else ""
                        weight = float(row[col_weight]) if col_weight and row[col_weight] is not None else 0.0
                        
                        if name:
                            holdings.append({
                                "name": name,
                                "code": code_val,
                                "weight": weight,
                            })
                            if code_val:
                                stock_codes.append(code_val)
        except Exception:
            pass
    
    return {"holdings": holdings, "stockCodes": stock_codes}
