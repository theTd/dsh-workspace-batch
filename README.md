# dsh-workspace-batch

<a id="english"></a>**English** · [中文](#中文)

A DeepSeek Harness web plugin that removes many sidebar Workspaces at once.

The entry sits at the far left of the Workspaces header — the first icon in the
`search / view options / add workspace` row.

## Usage

Tick rows → `Remove selected` → `Remove`.

| Control | Effect |
| --- | --- |
| Filter box | Matches title or path; the two buttons below act on the filtered result only |
| Select visible / Clear | Select or clear the current filtered result |
| Select zero-session / Deselect zero-session | Select Workspaces with zero unarchived sessions |

The `N sessions` badge counts **unarchived** sessions. Archiving keeps a
Workspace's session slots, so showing `sessionIds.length` would advertise
"46 sessions" on a Workspace that looks empty in the sidebar. Hover the badge to
see `N visible / M archived`.

## What it removes

**The registration row only** — one line in `tables.workspaces` plus one entry in
`global.workspaceIds` inside `workspace.json`. Same effect as the sidebar row's
`...` → `Delete`, except you can tick many at once.

It does not delete folders, does not delete session logs, does not stop a running
task. The one side effect: sessions owned by that Workspace fall under `Ungrouped`
in the sidebar and stay openable and searchable.

The host has no "refuse because a session is running" gate — that is the
`archiveSession` semantics — and this plugin does not invent one. The protection is
the confirmation step in the dialog.

## Install

```powershell
cd $HOME\.dsh\profiles\web
pnpm add -w "link:$HOME/.dsh/plugins/dsh-workspace-batch"
```

Or straight from this repository — public, or private with a git credential helper
such as `gh auth setup-git`:

```powershell
pnpm add -w "github:theTd/dsh-workspace-batch"
```

Then add `"dsh-workspace-batch"` to `dsh.profile.bundles` in `package.json`. With
`patchReload: live` and `dsh-client-hmr`, the profile hands it to an already open
page — no `dsh web` restart.

## Uninstall

```powershell
cd $HOME\.dsh\profiles\web
pnpm remove dsh-workspace-batch
```

Then drop the entry from `dsh.profile.bundles`.

## Development

No build step: `lib/client.js` is what the browser receives. Save it and
`dsh-client-hmr` (500 ms mtime/size poll) swaps it in within a second — no page
refresh.

Try it in an isolated instance, leaving real data alone:

```powershell
$env:DSH_HOME="$HOME\.dsh-verify"
dsh --profile web --port 3199 --no-open
```

| File | Role |
| --- | --- |
| `index.js` | Host half: an empty `apply()`, only there to hold one Loader row |
| `lib/client.js` | Everything: header entry, batch dialog, en/zh dictionaries |
| `cordis.patch.yml` | Bundle patch, one `insert` row |

## Limits

- **The entry is portaled into the header, not slotted.** The Workspaces header has
  no in-row action slot; the only sibling slot, `sidebar.workspaces.directoryFlow`,
  is the directory-picking hole — occupying it would turn "Add workspace" into this
  plugin. So it portals to `[data-slot="sidebar.workspaces.directoryFlow"]` (marked
  by slot name, not by a CSS hash), follows re-renders through a `MutationObserver`,
  and falls back to the sidebar footer when the anchor is missing. Worst case on a
  future DSH layout change: the button returns to the footer.
- Dictionaries ship for `en` and `zh` only; other languages fall back to `en`.
  Adding a language is adding one block to `DICTS`.
- No "does this path still exist" check: the browser has no `stat`. That would need
  a read-only HTTP route in the host half.
- The browser floor is the host's floor (React 18 + ESM); the plugin cannot be wider.

## Contracts

No `require` of any built-in Client package; three public surfaces only:

- `ctx.slots.inject` / `ctx.slots.register({ name, id, order, locale })`
- `ctx.workspaces.list.getSnapshot()` / `.subscribe(fn)` / `ctx.workspaces.delete(id)`
- `ctx.locale.register(ns, locale, dict)` / `ctx.locale.bind(ns)`

Styling uses `--dsw-alias-*` variables (each with a literal fallback); class prefix
`dswsb-`.

---

<a id="中文"></a>

## 中文

[English](#english)

DSH 浏览器插件：把侧边栏里堆积的 Workspace 一次性批量移除。

入口在工作区标题行最左侧，就是「搜索 / 视图选项 / 添加工作区」那一排的第一个图标。

### 用法

勾选 → `移除所选` → `确认移除`。

| 控件 | 作用 |
| --- | --- |
| 筛选框 | 按标题或路径过滤；下面两个按钮只作用于当前筛选结果 |
| 全选可见 / 清空 | 全选或取消当前筛选结果 |
| 选零会话 / 取消零会话 | 选中未归档会话数为 0 的 |

行上的 `N 个会话` 是**未归档**数量。归档不清 Workspace 的会话槽位，直接显示
`sessionIds.length` 会把「46 个会话」挂在侧边栏里空无一物的 Workspace 上。
悬停徽标可看 `N 可见 / M 归档`。

### 它删什么

**只删登记行**：`workspace.json` 里 `tables.workspaces` 的一行 +
`global.workspaceIds` 的一项。等价于侧边栏行尾 `...` → `Delete`，只是能一次勾多个。

不删目录、不删会话日志、不结束任何任务。唯一副作用：原本挂在该 Workspace 下的
会话会落到侧边栏 `Ungrouped`，仍可打开、可搜索。

宿主没有「会话正在运行所以拒绝删除」的闸门（那是 `archiveSession` 的语义），
本插件也不发明一个；保护手段是对话框里的二次确认。

### 安装

```powershell
cd $HOME\.dsh\profiles\web
pnpm add -w "link:$HOME/.dsh/plugins/dsh-workspace-batch"
```

或者直接从仓库装（公开仓可直接用；私有仓需要 git 凭据助手，例如
`gh auth setup-git`）：

```powershell
pnpm add -w "github:theTd/dsh-workspace-batch"
```

再把 `"dsh-workspace-batch"` 加到 `package.json` 的 `dsh.profile.bundles` 末尾。
profile 的 `patchReload: live` + `dsh-client-hmr` 会把它送进已打开的页面，
不用重启 `dsh web`。

### 卸载

```powershell
cd $HOME\.dsh\profiles\web
pnpm remove dsh-workspace-batch
```

再从 `dsh.profile.bundles` 里删掉那一项。

### 开发

无构建步骤：`lib/client.js` 就是浏览器拿到的产物。改完保存，`dsh-client-hmr`
每 500ms 轮询 `lib/client.js` 的 mtime/size，1 秒内热替换，页面不用刷。

隔离实例里试，不碰真实数据：

```powershell
$env:DSH_HOME="$HOME\.dsh-verify"
dsh --profile web --port 3199 --no-open
```

| 文件 | 作用 |
| --- | --- |
| `index.js` | 宿主半边，空的 `apply()`，只用来占住 Loader 一行 |
| `lib/client.js` | 全部逻辑：入口按钮 + 批量对话框 + en/zh 字典 |
| `cordis.patch.yml` | bundle patch，insert 一行 |

### 边界

- **入口是 portal 到标题行的，不是槽位。** 工作区标题行没有行内动作槽位；同级唯一
  的 `sidebar.workspaces.directoryFlow` 是目录选择流程的洞，占住它会让「添加工作区」
  点开本插件。所以走 portal，锚点用 `[data-slot="sidebar.workspaces.directoryFlow"]`
  （按槽位名标记，不随 CSS 哈希变），`MutationObserver` 跟随重渲染，找不到锚点就
  退回侧边栏底部。DSH 改版搬动那个容器时最坏掉回底部，不会静默消失。
- 只带 `en` / `zh` 字典，其他语言回退到 `en`；加语言等于往 `DICTS` 加一块。
- 不检测「路径是否还存在」：浏览器侧没有 `stat`，要做需给宿主半边加只读 HTTP 路由。
- 浏览器下限就是宿主的下限（React 18 + ESM），不是本插件能决定的。

### 依赖的契约

不 `require` 任何内置 Client 包，只用三个公开面：

- `ctx.slots.inject` / `ctx.slots.register({ name, id, order, locale })`
- `ctx.workspaces.list.getSnapshot()` / `.subscribe(fn)` / `ctx.workspaces.delete(id)`
- `ctx.locale.register(ns, locale, dict)` / `ctx.locale.bind(ns)`

样式全部走 `--dsw-alias-*` 变量（带字面量兜底），类名前缀 `dswsb-`。
