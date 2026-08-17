# 把角色模型放到这里

本目录（挂载为容器的 `/models/rvc`）里每个 `.pth` 文件都会自动变成一个
网页上可选的角色声音。推荐结构：

```text
models/
  sweet-female/
    model.pth          # RVC 模型（必需）
    model.index        # 检索索引（可选，让音色更像）
    meta.json          # 可选的角色展示信息
```

`meta.json` 示例：

```json
{
  "name": "甜美少女",
  "emoji": "🎀",
  "description": "甜美的少女音色。",
  "tags": ["女声", "甜美"]
}
```

也可以直接放扁平文件：`models/sweet-female.pth` + `models/sweet-female.index`。

注意：

- 模型文件不要提交到网站仓库（GitHub 单文件上限 100 MB，且权重有各自的许可）。
- 请确认你使用的每个模型都有对应的使用许可。
- 放入文件后重启容器，网站的角色列表会自动更新。
