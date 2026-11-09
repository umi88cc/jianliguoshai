-- 推广落地迁移：访问计数表（只计次数，不记 IP、不记个人信息）
-- 首页/模板页/订单页每次打开记 1 次；一天一页一行，INSERT ... ON CONFLICT 累加
CREATE TABLE IF NOT EXISTS page_views (
  day TEXT NOT NULL,
  page TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, page)
);
