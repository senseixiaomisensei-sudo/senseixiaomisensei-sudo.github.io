# 洛可可信笺主题

PostPrep 提供液态玻璃、纸面和洛可可信笺三种风格。点击页头的图层按钮依次切换；选择保存在浏览器的 `postprep-ui-style`，同一浏览器的其他标签页会同步。没有已保存选择时仍使用液态玻璃，原有访客的选择不会被覆盖。

主题覆盖首页、变声器及其他顶层工具页；`hoshino/` 和 `community/` 是独立界面。主题只改变表现和装饰，不替换变声、录音、上传、模型选择或结果下载的代码。资源放在 `assets/rococo/`，随网站一起部署，不依赖额外 CDN。字体来源及 SIL OFL 许可证见 `assets/rococo/fonts/LICENSE-OFL.txt`。

天空根据设备时间和系统深色模式变化。调试时可在网址加 `?rococo-time=morning`、`afternoon`、`dusk` 或 `night`，明确选择会覆盖系统深色模式。浏览器设置了“减少动态效果”时，装饰动画会降级。

## 维护与验证

- `node tools/rococo-inject.mjs --check` 检查所有页面的主题引用与顺序。
- `node tools/rococo-inject.mjs` 可幂等刷新引用；`node tools/v3-inject.mjs` 会保留主题在 v3 样式之后。
- `node --test tests/rococo-theme.test.mjs tests/theme-switching.test.mjs tests/local-server.test.mjs` 检查资源、切换、跨标签页同步及本地服务。
- `node serve.js` 从脚本所在目录启动本地预览，默认端口为 8124；可用环境变量 `PORT` 修改。音频代理仍使用原本的本地服务配置。
