@echo off
chcp 65001 >nul
title RVC AI 变声器网站服务
echo ====================================================
echo        RVC AI 变声器 (纯客户端 WebAssembly 版)
echo ====================================================
echo.
cd /d "E:\大肥鱼\site"

echo 正在启动本地与局域网 Web 服务 (端口: 8124)...
start "" /b cmd /c "node serve.js > nul 2>&1"

timeout /t 2 /nobreak >nul

echo 正在打开电脑浏览器访问 http://localhost:8124/rvc.html ...
start http://localhost:8124/rvc.html

echo.
echo ====================================================
echo 服务已成功启动！
echo 电脑端访问: http://localhost:8124/rvc.html
echo 手机端访问 (连同一WiFi): http://192.168.1.3:8124/rvc.html
echo ====================================================
echo.
pause
