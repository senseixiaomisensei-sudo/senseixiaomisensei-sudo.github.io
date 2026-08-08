# PostPrep

一个无需登录的双语创作者文案工具站：发布前检查长度、整理标签与清理排版。

## 访问

<https://senseixiaomisensei-sudo.github.io/>

## 本地预览

```bash
python -m http.server 8000
# 打开 http://localhost:8000/
```

## GitHub Pages 版本

`main` 分支根目录即为 GitHub Pages 发布源。长度检查、标签整理和排版整理都在浏览器内完成。

仓库中保留的 `functions/api/text.js` 是 Cloudflare Pages 函数源码；GitHub Pages 不会执行它，因此当前线上版本不会把草稿上传到云端，深度处理按钮会明确提示未配置。
