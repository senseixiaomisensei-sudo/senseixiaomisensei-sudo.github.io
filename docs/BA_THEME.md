# 蔚蓝档案主题

页头图层按钮依次切换液态玻璃、纸面、洛可可与蔚蓝档案。选择角色头像或使用方向键、Home、End 切换四位角色；主题与角色选择分别保存在浏览器中并跨标签同步。变声页在选择角色后尝试选择对应声音，手动选择其他声音仍然有效。

通过 `?ba=koyuki|hoshino|momoi|kei` 指定角色，`?ba-time=day|night` 可覆盖昼夜配色。支持减少动态效果的系统设置。

所有素材位于 `assets/ba/`。修改引用后运行 `node tools/ba-inject.mjs`，使用 `node tools/ba-inject.mjs --check` 检查顺序与重复；其他主题的注入工具也保留正确顺序。
