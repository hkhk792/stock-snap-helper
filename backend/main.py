"""
纯查询层 API - 从 SQLite 数据库读取数据
用户请求只查询数据库，绝不触发爬虫
"""
import os
import time
import sqlite3
from typing import List, Optional, Dict, Any
from datetime import datetime

from fastapi import FastAPI, File, HTTPException, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

try:
    from PIL import Image
    import pytesseract
except ImportError:
    Image = None
    pytesseract = None


APP_NAME = os.getenv("APP_NAME", "realvalue-backend")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

# 数据库文件
DB_FILE = os.path.join(os.path.dirname(__file__), "fund_data.db")

app = FastAPI(title=APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============== 缓存层 ==============
class MemoryCache:
    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}
    
    def get(self, key: str) -> Optional[Any]:
        item = self._cache.get(key)
        if item and time.time() - item["ts"] < item["ttl"]:
            return item["data"]
        return None
    
    def set(self, key: str, data: Any, ttl: int = 30):
        self._cache[key] = {"data": data, "ts": time.time(), "ttl": ttl}


cache = MemoryCache()


# ============== 数据库连接 ==============
def get_connection():
    if not os.path.exists(DB_FILE):
        raise HTTPException(status_code=500, detail="数据库文件不存在")
    return sqlite3.connect(DB_FILE)


# ============== 接口限流 ==============
rate_limit_store: Dict[str, List[float]] = {}


def check_rate_limit(ip: str, max_requests: int = 30, window: int = 60) -> bool:
    now = time.time()
    requests = rate_limit_store.get(ip, [])
    requests = [t for t in requests if now - t < window]
    
    if len(requests) >= max_requests:
        return False
    
    requests.append(now)
    rate_limit_store[ip] = requests
    return True


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    ip = request.client.host or "unknown"
    
    if not check_rate_limit(ip):
        return JSONResponse(
            status_code=429,
            content={"error": "请求过于频繁，请稍后再试"}
        )
    
    return await call_next(request)


# ============== 数据模型 ==============
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


# ============== API 端点 ==============
@app.get("/health")
def health():
    return {"ok": True, "name": APP_NAME, "mode": "query-only"}


@app.get("/api/fund/search")
def fund_search(keyword: str):
    """基金搜索 - 从数据库查询"""
    kw = (keyword or "").strip()
    if not kw:
        return []
    
    # 检查缓存
    cache_key = f"search_{kw}"
    cached = cache.get(cache_key)
    if cached:
        return cached
    
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        cur.execute("""
            SELECT code, name FROM funds 
            WHERE code LIKE ? OR name LIKE ?
            LIMIT 20
        """, (f"%{kw}%", f"%{kw}%"))
        
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        result = [{"code": r["code"], "name": r["name"], "type": "基金"} for r in rows]
        
        # 缓存结果
        cache.set(cache_key, result, ttl=30)
        return result
    except Exception as e:
        print(f"Search error: {e}")
        return []


@app.get("/api/fund/{code}")
def get_fund(code: str):
    """获取单个基金信息"""
    c = (code or "").strip()
    if not c:
        return {"error": "not found"}
    
    # 检查缓存
    cache_key = f"fund_{c}"
    cached = cache.get(cache_key)
    if cached:
        return cached
    
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        cur.execute("""
            SELECT code, name, price, update_time FROM funds WHERE code = ?
        """, (c,))
        
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if not row:
            return {"error": "not found"}
        
        result = {
            "code": row["code"],
            "name": row["name"],
            "price": row["price"],
            "update_time": row["update_time"]
        }
        
        # 缓存结果
        cache.set(cache_key, result, ttl=30)
        return result
    except Exception as e:
        print(f"Get fund error: {e}")
        return {"error": str(e)}


@app.get("/api/fund/estimate")
def fund_estimate(code: str):
    """基金估值 - 从数据库查询"""
    c = (code or "").strip()
    if not c:
        return None
    
    # 检查缓存
    cache_key = f"estimate_{c}"
    cached = cache.get(cache_key)
    if cached:
        return cached
    
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        cur.execute("""
            SELECT code, name, price, update_time FROM funds WHERE code = ?
        """, (c,))
        
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        if not row:
            return None
        
        update_dt = None
        if row["update_time"]:
            try:
                update_dt = datetime.fromisoformat(row["update_time"])
            except:
                pass
        
        result = {
            "code": row["code"],
            "name": row["name"],
            "lastNav": float(row["price"] or 0),
            "lastNavDate": update_dt.strftime("%Y-%m-%d") if update_dt else "",
            "estimatedNav": float(row["price"] or 0),
            "estimatedChange": 0.0,
            "estimatedTime": row["update_time"] or "",
        }
        
        # 缓存结果
        cache.set(cache_key, result, ttl=30)
        return result
    except Exception as e:
        print(f"Estimate error: {e}")
        return None


@app.get("/api/fund/holdings")
def fund_holdings(code: str):
    """基金持仓 - 暂时返回空数据"""
    return {"holdings": [], "stockCodes": []}


@app.get("/api/quotes")
def quotes(codes: str):
    """股票行情 - 暂时返回空数据"""
    return []


@app.get("/api/indices")
def indices():
    """全球指数 - 从数据库查询"""
    # 检查缓存
    cache_key = "indices"
    cached = cache.get(cache_key)
    if cached:
        return cached
    
    try:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        cur.execute("SELECT code, name, price FROM indices")
        
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        result = [
            {"code": r["code"], "name": r["name"], "price": float(r["price"] or 0), "changePercent": 0.0}
            for r in rows
        ]
        
        # 缓存结果
        cache.set(cache_key, result, ttl=60)
        return result
    except Exception as e:
        print(f"Indices error: {e}")
        return []


@app.post("/api/ocr/holdings", response_model=OcrResult)
async def ocr_holdings(file: UploadFile = File(...)):
    """OCR 识别持仓"""
    import re
    import io
    
    if Image is None or pytesseract is None:
        raise HTTPException(status_code=500, detail="OCR dependencies not installed")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file")

    raw = await file.read()
    try:
        img = Image.open(io.BytesIO(raw))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")

    try:
        text = pytesseract.image_to_string(img, lang="chi_sim+eng")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR failed: {e}")

    # 解析持仓
    holdings = []
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines() if ln.strip()]
    code_re = re.compile(r"\b(\d{6})\b")
    weight_re = re.compile(r"(\d{1,2}(?:\.\d{1,2})?)\s*%")
    
    seen = set()
    for ln in lines:
        m_code = code_re.search(ln)
        if not m_code:
            continue
        code = m_code.group(1)
        
        m_w = weight_re.search(ln)
        weight = float(m_w.group(1)) if m_w else 0
        
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
        holdings.append(OcrHolding(name=name, code=code, weight=weight))
    
    holdings.sort(key=lambda h: h.weight, reverse=True)
    return OcrResult(text=text, holdings=holdings[:200])
