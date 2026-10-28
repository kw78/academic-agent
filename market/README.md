# DSH 插件市场索引

DSH 目前**没有官方中央市场**。它的插件市场（Plugins → Discover）读取用户自己添加的索引 URL；本目录就是 Academic Agent 的格式 1 索引。

索引地址（GitHub Pages，已验证 HTTP 200、无重定向）：

```text
https://kw78.github.io/academic-agent/market/index.json
```

图标使用同目录的相对路径，DSH 会基于索引 URL 解析。

备用地址（当前网络对 raw.githubusercontent.com 不稳定，不推荐）：

```text
https://raw.githubusercontent.com/kw78/academic-agent/main/market/index.json
```

## 在 DSH 中显示

1. 安装实验性的插件市场 bundle（如果当前 profile 还没有）：

```bash
dsh plugin --profile desktop add @deepseek-ai/dsh-experimental-plugin-market-bundle@0.2.1-rc.3
```

2. 在该 profile 的 `dsh.profile.bundles` 中加入：

```json
"@deepseek-ai/dsh-experimental-plugin-market-bundle"
```

3. 重启 DSH，打开 Plugins → Discover。
4. 添加上面的索引 URL，搜索 `Academic Agent`。

索引里有两项：

- `@academic/dsh-plugin`：Host / Planner / Tools
- `@academic/dsh-ui`：侧边栏与“学业”面板

两项都使用 Git commit 固定安装，不依赖 npm 发布。

## 验证

索引已用 `@deepseek-ai/dsh-plugin-market-index@0.2.1-rc.3` 的 `parseMarketIndex` 校验通过；相对图标解析为：

```text
https://raw.githubusercontent.com/kw78/academic-agent/main/market/icon.svg
```

如果 DSH 无法访问 GitHub Pages，可以把 `index.json` 和 `icon.svg` 放到任意 HTTPS 静态主机，保持相对路径不变，并在 Discover 中填写新地址。
