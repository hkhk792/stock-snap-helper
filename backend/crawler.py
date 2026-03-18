"""
离线爬虫脚本 - 每10分钟执行一次
从 AKShare 获取基金数据并写入 Supabase 数据库
使用 psycopg2 直接连接数据库
"""
import os
import psycopg2
from datetime import datetime
from typing import List

try:
    import akshare as ak
except ImportError:
    ak = None

try:
    import requests
except ImportError:
    requests = None


# 数据库连接字符串
DB_URL = os.getenv("SUPABASE_DB_URL", "")


def get_connection():
    """获取数据库连接"""
    if not DB_URL:
        raise ValueError("SUPABASE_DB_URL 环境变量未设置")
    return psycopg2.connect(DB_URL)


def crawl_funds() -> List[tuple]:
    """爬取基金数据"""
    if ak is None:
        print("AKShare 未安装")
        return []
    
    funds = []
    
    try:
        print("正在获取开放式基金排行...")
        df = ak.fund_em_open_fund_rank()
        
        for _, row in df.iterrows():
            code = str(row.get("基金代码", ""))
            name = str(row.get("基金简称", ""))
            price = float(row.get("单位净值", 0) or 0)
            
            if code:
                funds.append((code, name, price, datetime.now()))
        
        print(f"获取到 {len(funds)} 只开放式基金")
    except Exception as e:
        print(f"获取开放式基金失败: {e}")
    
    try:
        print("正在获取 ETF 基金数据...")
        df = ak.fund_etf_spot_em()
        
        col_code = next((c for c in df.columns if "代码" in str(c)), None)
        col_name = next((c for c in df.columns if "名称" in str(c)), None)
        col_price = next((c for c in df.columns if "最新价" in str(c) or "最新" in str(c)), None)
        
        if all([col_code, col_name, col_price]):
            for _, row in df.iterrows():
                code = str(row[col_code])
                name = str(row[col_name])
                price = float(row[col_price] or 0)
                
                if code and not any(f[0] == code for f in funds):
                    funds.append((code, name, price, datetime.now()))
        
        print(f"总共获取到 {len(funds)} 只基金")
    except Exception as e:
        print(f"获取 ETF 基金失败: {e}")
    
    return funds


def crawl_indices() -> List[tuple]:
    """爬取指数数据"""
    indices = []
    
    try:
        # 中国指数 - AKShare
        if ak is not None:
            print("正在获取中国指数...")
            df = ak.stock_zh_index_spot_em(symbol="沪深重要指数")
            
            cols = list(df.columns)
            col_code = next((c for c in cols if str(c) in ["代码", "指数代码"]), None)
            col_name = next((c for c in cols if str(c) in ["名称", "指数名称"]), None)
            col_price = next((c for c in cols if "最新" in str(c)), None)
            
            if all([col_code, col_name, col_price]):
                keep = {"000001", "399001", "399006", "000300", "000905"}
                
                for _, r in df[df[col_code].astype(str).isin(keep)].iterrows():
                    code = str(r[col_code])
                    name = str(r[col_name])
                    price = float(r[col_price] or 0)
                    indices.append((code, name, price, datetime.now()))
    except Exception as e:
        print(f"获取中国指数失败: {e}")
    
    try:
        # 全球指数 - Yahoo Finance
        if requests is not None:
            print("正在获取全球指数...")
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
            
            r = requests.get(
                url,
                params={"symbols": symbols},
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "application/json",
                },
                timeout=10,
            )
            r.raise_for_status()
            js = r.json()
            
            result = js.get("quoteResponse", {}).get("result", []) or []
            by_symbol = {str(it.get("symbol", "")).upper(): it for it in result}
            
            for sym, name in targets:
                key = sym.replace("%5E", "^").upper()
                it = by_symbol.get(key)
                if it:
                    price = it.get("regularMarketPrice")
                    if price is not None:
                        indices.append((key, name, float(price), datetime.now()))
    except Exception as e:
        print(f"获取全球指数失败: {e}")
    
    print(f"总共获取到 {len(indices)} 个指数")
    return indices


def save_funds(funds: List[tuple]):
    """保存基金数据到数据库（使用 UPSERT）"""
    if not funds:
        return 0
    
    conn = get_connection()
    cur = conn.cursor()
    
    count = 0
    for code, name, price, update_time in funds:
        try:
            cur.execute("""
                INSERT INTO funds (code, name, price, update_time)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (code)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    price = EXCLUDED.price,
                    update_time = EXCLUDED.update_time
            """, (code, name, price, update_time))
            count += 1
        except Exception as e:
            print(f"插入基金 {code} 失败: {e}")
    
    conn.commit()
    cur.close()
    conn.close()
    
    print(f"成功保存 {count} 条基金数据")
    return count


def save_indices(indices: List[tuple]):
    """保存指数数据到数据库（使用 UPSERT）"""
    if not indices:
        return 0
    
    conn = get_connection()
    cur = conn.cursor()
    
    count = 0
    for code, name, price, update_time in indices:
        try:
            cur.execute("""
                INSERT INTO indices (code, name, price, update_time)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (code)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    price = EXCLUDED.price,
                    update_time = EXCLUDED.update_time
            """, (code, name, price, update_time))
            count += 1
        except Exception as e:
            print(f"插入指数 {code} 失败: {e}")
    
    conn.commit()
    cur.close()
    conn.close()
    
    print(f"成功保存 {count} 条指数数据")
    return count


def run():
    """主函数"""
    print(f"\n{'='*50}")
    print(f"开始爬虫任务: {datetime.now().isoformat()}")
    print(f"{'='*50}\n")
    
    # 1. 爬取基金数据
    funds = crawl_funds()
    if funds:
        save_funds(funds)
    
    # 2. 爬取指数数据
    indices = crawl_indices()
    if indices:
        save_indices(indices)
    
    print(f"\n{'='*50}")
    print(f"爬虫任务完成: {datetime.now().isoformat()}")
    print(f"基金: {len(funds)} 条, 指数: {len(indices)} 条")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    run()
