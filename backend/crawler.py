"""
离线爬虫脚本 - 每10分钟执行一次
从 AKShare 获取基金数据并写入 Supabase 数据库
"""
import os
import psycopg2
from datetime import datetime
from typing import List

try:
    import akshare as ak
except ImportError:
    ak = None

DB_URL = os.getenv("SUPABASE_DB_URL", "")


def get_connection():
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
        df = ak.fund_open_fund_rank_em()
        for _, row in df.iterrows():
            code = str(row.get("基金代码", ""))
            name = str(row.get("基金简称", ""))
            price = float(row.get("单位净值", 0) or 0)
            if code and price > 0:
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
                if code and price > 0 and not any(f[0] == code for f in funds):
                    funds.append((code, name, price, datetime.now()))
        print(f"总共获取到 {len(funds)} 只基金")
    except Exception as e:
        print(f"获取 ETF 基金失败: {e}")

    return funds


def crawl_indices() -> List[tuple]:
    """爬取指数数据 - 全部使用 AKShare"""
    if ak is None:
        print("AKShare 未安装")
        return []

    indices = []

    # 中国指数
    try:
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
                if price > 0:
                    indices.append((code, name, price, datetime.now()))
        print(f"获取到 {len(indices)} 个中国指数")
    except Exception as e:
        print(f"获取中国指数失败: {e}")

    # 全球指数 - 使用 index_global_spot_em
    try:
        print("正在获取全球指数...")
        df = ak.index_global_spot_em()

        # 需要的全球指数代码
        global_keep = {
            "N225": "日经225",
            "HSI": "恒生指数",
            "SENSEX": "印度Sensex",
            "STI": "富时新加坡海峡时报",
            "TWII": "台湾加权",
            "KS11": "韩国KOSPI",
            "RTS": "俄罗斯RTS",
        }

        col_code = next((c for c in df.columns if "代码" in str(c)), None)
        col_name = next((c for c in df.columns if "名称" in str(c)), None)
        col_price = next((c for c in df.columns if "最新价" in str(c)), None)

        if all([col_code, col_name, col_price]):
            for _, r in df.iterrows():
                code = str(r[col_code])
                if code in global_keep:
                    price = float(r[col_price] or 0)
                    if price > 0:
                        indices.append((code, global_keep[code], price, datetime.now()))

        print(f"从全球指数获取到 {len(indices)} 个指数（含中国）")
    except Exception as e:
        print(f"获取全球指数失败: {e}")

    print(f"总共获取到 {len(indices)} 个指数")
    return indices


def save_funds(funds: List[tuple]):
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
                DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, update_time = EXCLUDED.update_time
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
                DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, update_time = EXCLUDED.update_time
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
    print(f"\n{'='*50}")
    print(f"开始爬虫任务: {datetime.now().isoformat()}")
    print(f"{'='*50}\n")

    funds = crawl_funds()
    if funds:
        save_funds(funds)

    indices = crawl_indices()
    if indices:
        save_indices(indices)

    print(f"\n{'='*50}")
    print(f"爬虫任务完成: {datetime.now().isoformat()}")
    print(f"基金: {len(funds)} 条, 指数: {len(indices)} 条")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    run()
