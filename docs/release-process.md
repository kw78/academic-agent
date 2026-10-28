# 发布流程（v0.2.0 起）

发布由 tag 驱动：`.github/workflows/release.yml` 在推送 `v*` tag 或手动指定 tag 时执行。

## 版本一致性

以下文件必须同时更新：

- 根 `package.json`
- `packages/academic-dsh-plugin/package.json`
- `packages/academic-dsh-ui/package.json`
- `packages/academic-dsh-plugin/dsh.plugin.json`
- `packages/academic-dsh-ui/src/api.ts` 的 `status().version`

发布前本地校验：

```bash
node scripts/verify-release-version.mjs 0.2.0
```

## 触发一次发布

1. 写 `docs/releases/vX.Y.Z.md`（发布说明），把 README 的发布说明链接指过去。
2. 提交版本与文档。
3. 推送 tag：

```bash
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

或在 Actions 页面手动运行 `Release`，输入已存在的 tag。

流水线依次执行：`npm ci` → 版本校验 → typecheck → 测试 → 构建 → `npm pack` + `SHA256SUMS` → GitHub Release → npm 发布 → 更新市场索引。

## npm 发布

`Publish to npm` 步骤使用仓库 secret `NPM_TOKEN`：

- 需要一个有权发布 `@academic` scope 的 npm token（Granular/Automation token，仅 publish 权限即可）。
- 在 GitHub 仓库 Settings → Secrets and variables → Actions 添加 `NPM_TOKEN`。**不要把 token 写进仓库或聊天。**
- 如果账号尚未拥有 `@academic` scope，需要先在 npm 创建同名组织（或调整包名后重新发布）。
- 发布带 `--provenance`，需要 workflow 的 `id-token: write`（已配置）。

没有 `NPM_TOKEN` 时流水线不会失败，会在日志中给出警告并跳过 npm；GitHub Release 与市场索引仍会更新。

手动补发（本地已登录 npm 时）：

```bash
npm publish dist/release/academic-dsh-plugin-0.2.0.tgz --access public
npm publish dist/release/academic-dsh-ui-0.2.0.tgz --access public
```

## 市场索引

`scripts/update-market-index.mjs` 把 `market/index.json` 的 `dist-tags.latest` 与对应版本条目更新为发布 tag 的 commit，并提交回 `main`（GitHub Pages 随后更新）。若主分支保护不允许 Actions 推送，需要手动执行脚本并提交。

## 失败处理

- npm 发布失败：GitHub Release 已生成；修复 token/scope 后在 Actions 重跑 `Release`。重复发布同一版本会被 npm 拒绝，需提高版本号。
- 市场索引 push 失败：本地运行 `node scripts/update-market-index.mjs <version> <tag-commit>` 后提交。
- 已发布版本不要 force push 或移动 tag；修正以新版本发布。
