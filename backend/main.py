"""
统一 API 接口 - 直接调用天天基金 API
不需要数据库，用户信息用 Supabase Auth
"""
import os
import time
import json
import re
import requests
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

app = FastAPI(title=APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============== 启动调试 ==============
@app.on_event("startup")
async def startup_event():
    print(f"\n{'='*50}")
    print(f"后端启动：{datetime.now().isoformat()}")
    print(f"模式：直接调用天天基金 API")
    print(f"{'='*50}\n")


# ============== 缓存层 ==============
class MemoryCache:
    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}
    
    def get(self, key: str) -> Optional[Any]:
        item = self._cache.get(key)
        if item and time.time() - item["ts"] < item["ttl"]:
            return item["data"]
        return None
    
    def set(self, key: str, data: Any, ttl: int = 60):
        self._cache[key] = {"data": data, "ts": time.time(), "ttl": ttl}


cache = MemoryCache()


# ============== 接口限流 ==============
rate_limit_store: Dict[str, List[float]] = {}


def check_rate_limit(ip: str, max_requests: int = 100, window: int = 60) -> bool:
    now = time.time()
    requests_list = rate_limit_store.get(ip, [])
    requests_list = [t for t in requests_list if now - t < window]
    
    if len(requests_list) >= max_requests:
        return False
    
    requests_list.append(now)
    rate_limit_store[ip] = requests_list
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


# ============== 天天基金 API 封装 ==============
class EastMoneyAPI:
    """天天基金 API 封装"""
    
    BASE_URL = "http://fundsuggest.eastmoney.com"
    FUND_GZ_URL = "http://fundgz.1234567.com.cn"
    
    @staticmethod
    def search_fund(keyword: str, limit: int = 20) -> List[Dict]:
        """搜索基金"""
        if not keyword:
            return []
        
        cache_key = f"search_{keyword}"
        cached = cache.get(cache_key)
        if cached:
            return cached
        
        try:
            url = f"{EastMoneyAPI.BASE_URL}/FundSearch/api/FundSearchAPI.ashx"
            params = {
                "m": "1",
                "key": keyword,
                "pagesize": limit
            }
            
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "http://fund.eastmoney.com/"
            }
            
            resp = requests.get(url, params=params, headers=headers, timeout=10)
            
            if resp.status_code == 200:
                data = resp.json()
                result = []
                
                datas = data.get("Datas", [])
                for item in datas:
                    result.append({
                        "code": item.get("CODE", ""),
                        "name": item.get("NAME", ""),
                        "type": item.get("FundBaseInfo", {}).get("FTYPE", "基金"),
                        "pinyin": item.get("JIANPIN", "")
                    })
                
                cache.set(cache_key, result, ttl=30)
                return result
            
        except Exception as e:
            print(f"搜索基金失败: {e}")
        
        return []
    
    @staticmethod
    def get_fund_info(code: str) -> Optional[Dict]:
        """获取基金详情和估值"""
        if not code:
            return None
        
        cache_key = f"fund_{code}"
        cached = cache.get(cache_key)
        if cached:
            return cached
        
        try:
            url = f"{EastMoneyAPI.FUND_GZ_URL}/js/{code}.js"
            params = {"rt": int(time.time() * 1000)}
            
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "http://fund.eastmoney.com/"
            }
            
            resp = requests.get(url, params=params, headers=headers, timeout=10)
            
            if resp.status_code == 200:
                text = resp.text
                
                match = re.search(r'jsonpgz\((.*?)\)', text)
                if match:
                    data = json.loads(match.group(1))
                    
                    result = {
                        "code": data.get("fundcode", ""),
                        "name": data.get("name", ""),
                        "price": float(data.get("dwjz", 0) or 0),
                        "estimatedNav": float(data.get("gsz", 0) or 0),
                        "estimatedChange": float(data.get("gszzl", 0) or 0),
                        "estimatedTime": data.get("gztime", ""),
                        "update_time": data.get("jzrq", ""),
                        "type": data.get("fundtype", "")
                    }
                    
                    cache.set(cache_key, result, ttl=30)
                    return result
            
        except Exception as e:
            print(f"获取基金信息失败: {e}")
        
        return None
    
    @staticmethod
    def get_fund_estimate(code: str) -> Optional[Dict]:
        """获取基金估值"""
        info = EastMoneyAPI.get_fund_info(code)
        if info:
            return {
                "code": info["code"],
                "name": info["name"],
                "lastNav": info["price"],
                "lastNavDate": info["update_time"],
                "estimatedNav": info["estimatedNav"],
                "estimatedChange": info["estimatedChange"],
                "estimatedTime": info["estimatedTime"]
            }
        return None


eastmoney = EastMoneyAPI()


# ============== API 端点 ==============
@app.get("/health")
def health():
    return {"ok": True, "name": APP_NAME, "mode": "eastmoney-api"}


@app.get("/api/fund/search")
def fund_search(keyword: str):
    """基金搜索 - 调用天天基金 API"""
    kw = (keyword or "").strip()
    if not kw:
        return []
    
    return eastmoney.search_fund(kw)


@app.get("/api/fund/{code}")
def get_fund(code: str):
    """获取单个基金信息"""
    c = (code or "").strip()
    if not c:
        return {"error": "not found"}
    
    info = eastmoney.get_fund_info(c)
    if not info:
        return {"error": "not found"}
    
    return info


@app.get("/api/fund/estimate")
def fund_estimate(code: str):
    """基金估值 - 调用天天基金 API"""
    c = (code or "").strip()
    if not c:
        return None
    
    return eastmoney.get_fund_estimate(c)


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
    """全球指数 - 暂时返回空数据"""
    return []


@app.post("/api/ocr/holdings", response_model=OcrResult)
async def ocr_holdings(file: UploadFile = File(...)):
    """OCR 识别持仓"""
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
