"""
统一 API 接口 - 直接调用天天基金 API + iTick API
用户收藏功能用 Supabase 数据库
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

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None
    Client = None


APP_NAME = os.getenv("APP_NAME", "realvalue-backend")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

# iTick API Key
ITICK_API_KEY = "ebfed44021b243f39cf9211a11f9f67f6b84cd12360747359e16618033190759"

# Supabase 配置
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
supabase: Optional[Client] = None

if create_client and SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"Supabase 初始化失败: {e}")

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
    print(f"模式：天天基金 API + iTick API")
    print(f"Supabase：{'已连接' if supabase else '未配置'}")
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


class FavoriteFund(BaseModel):
    code: str
    name: str


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


# ============== iTick API 封装 ==============
class ITickAPI:
    """iTick API 封装 - 获取全球指数数据"""
    
    BASE_URL = "https://api.itick.io"
    
    INDEX_SYMBOLS = {
        "000001.SH": "上证指数",
        "399001.SZ": "深证成指",
        "399006.SZ": "创业板指",
        "000300.SH": "沪深300",
        "HSI.HK": "恒生指数",
        "DJI.US": "道琼斯",
        "SPX.US": "标普500",
        "IXIC.US": "纳斯达克",
        "N225.JP": "日经225",
        "FTSE.UK": "富时100",
        "GDAXI.DE": "德国DAX",
        "CAC40.FR": "法国CAC40",
    }
    
    @staticmethod
    def get_indices() -> List[Dict]:
        """获取全球指数数据"""
        cache_key = "global_indices"
        cached = cache.get(cache_key)
        if cached:
            return cached
        
        result = []
        
        try:
            for symbol, name in ITickAPI.INDEX_SYMBOLS.items():
                try:
                    url = f"{ITickAPI.BASE_URL}/stock/quote"
                    params = {"symbol": symbol}
                    headers = {
                        "Authorization": f"Bearer {ITICK_API_KEY}",
                        "Content-Type": "application/json"
                    }
                    
                    resp = requests.get(url, params=params, headers=headers, timeout=5)
                    
                    if resp.status_code == 200:
                        data = resp.json()
                        quote = data.get("data", {})
                        
                        result.append({
                            "code": symbol,
                            "name": name,
                            "price": float(quote.get("close", 0) or 0),
                            "changePercent": float(quote.get("changeRate", 0) or 0) * 100,
                            "change": float(quote.get("change", 0) or 0)
                        })
                except Exception as e:
                    print(f"获取指数 {symbol} 失败: {e}")
                    continue
            
            cache.set(cache_key, result, ttl=60)
            
        except Exception as e:
            print(f"获取全球指数失败: {e}")
        
        return result


eastmoney = EastMoneyAPI()
itick = ITickAPI()


# ============== API 端点 ==============
@app.get("/health")
def health():
    return {"ok": True, "name": APP_NAME, "mode": "eastmoney-api + itick-api"}


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
    """全球指数 - 调用 iTick API"""
    return itick.get_indices()


# ============== 用户收藏功能 ==============
@app.get("/api/user/favorites")
def get_favorites(user_id: str):
    """获取用户收藏的基金"""
    if not supabase:
        return {"error": "数据库未配置"}
    
    try:
        response = supabase.table("user_favorites").select("*").eq("user_id", user_id).execute()
        return {"favorites": response.data}
    except Exception as e:
        print(f"获取收藏失败: {e}")
        return {"favorites": []}


@app.post("/api/user/favorites")
def add_favorite(user_id: str, fund_code: str, fund_name: str):
    """添加收藏"""
    if not supabase:
        return {"error": "数据库未配置"}
    
    try:
        response = supabase.table("user_favorites").insert({
            "user_id": user_id,
            "fund_code": fund_code,
            "fund_name": fund_name,
            "created_at": datetime.now().isoformat()
        }).execute()
        return {"success": True, "data": response.data}
    except Exception as e:
        print(f"添加收藏失败: {e}")
        return {"error": str(e)}


@app.delete("/api/user/favorites")
def remove_favorite(user_id: str, fund_code: str):
    """删除收藏"""
    if not supabase:
        return {"error": "数据库未配置"}
    
    try:
        response = supabase.table("user_favorites").delete().eq("user_id", user_id).eq("fund_code", fund_code).execute()
        return {"success": True}
    except Exception as e:
        print(f"删除收藏失败: {e}")
        return {"error": str(e)}


# ============== OCR 功能 ==============
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
