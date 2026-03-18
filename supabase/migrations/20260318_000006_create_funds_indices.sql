-- 创建基金数据表
CREATE TABLE IF NOT EXISTS funds (
    code TEXT PRIMARY KEY,
    name TEXT,
    price FLOAT,
    update_time TIMESTAMP
);

-- 创建指数数据表
CREATE TABLE IF NOT EXISTS indices (
    code TEXT PRIMARY KEY,
    name TEXT,
    price FLOAT,
    update_time TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_funds_code ON funds(code);
CREATE INDEX IF NOT EXISTS idx_funds_name ON funds(name);
CREATE INDEX IF NOT EXISTS idx_indices_code ON indices(code);
