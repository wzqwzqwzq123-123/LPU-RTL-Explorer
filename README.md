# LPU RTL Explorer

LPU RTL Explorer 是 LPU 硬件架构的交互式可视化应用，用于查看功能拓扑、RTL 层次、接口语义、规模组成和架构证据。Public Preview v0.1 保留当前完整可视化交互，通过 GitHub Pull Request 协作，并由 Cloudflare Pages 自动生成预览和正式版本。

## 技术栈与主要视图

项目使用 React 18、TypeScript、Vite 5、React Flow 和 Node.js。本地 Node 服务负责扫描与 API；Cloudflare Pages 发布只读静态 Snapshot。

- **Physical Architecture**：West / Central / East 功能拓扑、FU Frontend 和语义接口。
- **Functional Block**：MEM、MXM、SXM、VXM、Program Load / DMA 等多层下钻。
- **Connectivity**：数据面与控制面接口网络。
- **RTL Hierarchy**：当前 Snapshot 的实例层次与连接证据。
- **Configuration**：统一大画布和分区画布中的规模、阵列与组成。
- **Bus Detail / Inspector**：接口方向、信号、位宽、端点、参数和证据状态。

所有主要画布保留缩放、平移、Fit、搜索、下钻、返回和浏览器 Back/Forward。

## 可视化布局约束

- 数据流与控制流采用正交连线，禁止使用斜线箭头。
- 节点、接口标签、箭头头部、分组标题和说明文字不得互相覆盖。
- 大型系统分区可以被连线穿过，但连线不得横穿实际功能模块矩形。

## 本地启动

首次克隆后，将 `config.example.json` 复制为本地 `config.json`，并填写 RTL 根目录与 Verible 路径。`config.json` 只用于本机，不会提交到 Git。

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

访问 `http://127.0.0.1:4173/`。该模式由 Node.js 提供本地 Snapshot、重新扫描、导入导出、Metadata 保存和源码片段读取。

需要前端热更新时，保持 `pnpm start` 运行，并在另一终端执行 `pnpm dev`，访问 `http://127.0.0.1:5173/`。

## 构建与测试

```powershell
pnpm test
pnpm build
```

Cloudflare Pages 配置：

```text
Build command: npm run build
Build output directory: dist
Production branch: main
```

生产构建会复制 `public/` 到 `dist/`，其中 `_redirects` 保证刷新和前端路由回退正常。

## 架构数据模型

本地扫描结果写入 `data/architecture-snapshot.json`，包含模块定义、层次、语义连接、Physical Architecture 和 Configuration 模型。原始本地 Snapshot 不提交到 Git。

公网版本使用脱敏、只读的 `public/data/architecture-snapshot.json`。更新当前 Snapshot 后运行：

```powershell
pnpm snapshot:public
```

生成脚本会合并 Configuration 数据，移除本地绝对路径和详细 Git 工作区状态。公网模式保留 Snapshot 中已有的接口、位宽、连接表达式、参数、Metadata 和必要代码片段，但不提供本地 RTL 正文读取，也不能在线重新扫描或持久化编辑。

## 目录结构

```text
src/                         React 页面、画布、Inspector 与样式
server/                      本地扫描、模型构建和 API
data/                        架构规则与本地生成数据
public/data/                 公网只读 Snapshot
scripts/                     扫描辅助和公开 Snapshot 生成脚本
tests/                       Node 自动化测试
docs/                        可视化与协作规范
.github/                     PR 模板和持续集成
```

主要入口和页面映射见 [AGENTS.md](AGENTS.md)，详细布局规则见 [docs/visualization-guidelines.md](docs/visualization-guidelines.md)。

## GitHub 与 Pull Request 流程

`main` 是唯一生产分支。日常修改从最新 `main` 创建 `feature/<topic>` 或 `codex/<topic>` 分支，完成后提交 Pull Request：

1. 描述修改目的、文件、页面和主要变化。
2. 记录实际构建、测试与浏览器检查结果。
3. 等待 Cloudflare 为 PR 生成独立 Preview。
4. 在 Preview 中检查页面和交互。
5. 由项目维护者审核并合并到 `main`。
6. Cloudflare 自动更新固定的生产网址。

禁止直接或强制推送 `main`。多个开发者同时工作时使用独立分支和 PR，避免互相覆盖。

## Codex 使用方式

协作者可在自己的 Codex 中连接 GitHub、选择本仓库并阅读根目录 [AGENTS.md](AGENTS.md)。Codex 应在独立分支内复用现有组件和数据模型，完成必要验证后创建 Pull Request。项目不在网页内嵌 Codex，也不使用 Codex SDK。

## Cloudflare Pages

Cloudflare Pages 通过 GitHub Integration 连接本仓库：

- 项目：`lpu-rtl-explorer`
- 生产分支：`main`
- PR / Feature Branch：独立 Preview，不影响生产站点
- 合并到 `main`：自动部署到固定 `pages.dev` 地址

公网版本是可视化 Snapshot，不要求 Cloudflare 访问本机 D 盘或原始 RTL 仓库。

## 安全与范围

不要提交完整 RTL 仓库、`node_modules`、波形、EDA 日志、构建缓存、凭据、Token、SSH 私钥或个人配置。`D:\LPU\FTLPU-VMODEL-main` 始终保持独立，Explorer 的任何构建和部署都不得修改它。
