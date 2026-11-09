# 二维码图片说明

本目录的 4 张 PNG 二维码是站长提供的物料（复用博客那套）：

- `wechat-merchant-pay-qr.png` — 微信商户收款码（订单页展示用）
- `alipay-pay-qr.png` — 支付宝收款码（订单页展示用）
- `wechat-consult-qr.png` — 微信咨询二维码（中文版联系方式）
- `qq-consult-qr.png` — QQ 咨询二维码（中文版联系方式）

**存放位置**：图片已上传到 Cloudflare R2 存储桶 `resume-files`（扁平 key，与文件名相同），
网站通过 Worker 的 `/img/:key` 路由代理访问（例如 `/img/wechat-consult-qr.png`），不暴露 R2 直链。

**为什么 PNG 不在 GitHub 里**：快照推送（snapshot push）只支持 UTF-8 文本文件，二进制文件会被整单拒绝。
本地 `public/assets/qr/` 里的 PNG 是备份源文件；R2 是线上唯一真相来源。如需更新某张码：
先替换本地文件，再跑 `python3 ../upload_qr.py` 重新上传到 R2 即可（同名覆盖）。
