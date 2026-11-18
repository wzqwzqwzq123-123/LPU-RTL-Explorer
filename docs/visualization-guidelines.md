# RTL Explorer 可视化规范

## 表达层次

- 模块包含关系使用容器或下钻层级表达，不使用无边界的散点图替代。
- Physical Architecture 表达功能拓扑；RTL Hierarchy 表达源码实例层次。人工架构分组不得冒充 RTL module。
- Functional Block 的下钻和返回必须沿用统一的浏览器历史与画布状态机制。
- Configuration 使用阵列、网格和重复单元表达真实规模；不要用一句倍数文本替代可读结构。

## 节点与连线

- 接口关系使用带明确方向的语义连线，并保持箭头可见。
- 连线可穿过系统级分区容器，但不得穿过 East/West Program Branch 等具体功能节点。
- 避免节点、接口框、标签和连线相互覆盖；优先调整端口、折线路径和间距。
- 数据面、控制面、确认状态和架构推断使用既有分类配色，不为单页引入新的颜色语义。
- 保持大字号和足够的缩放余量；所有画布继续支持缩放、平移与 Fit。

## 证据边界

- `rtl-confirmed` 只用于当前 Snapshot 能直接支持的模块、参数、端口或连接。
- 人工组织、规格图映射和结构推断使用 `architecture-inferred` 或 `needs-review`。
- 不随意改写 Snapshot 中的源码文件、行号、端口、位宽和连接表达式。
- 在线部署不提供本地 RTL 正文读取；Inspector 仍展示 Snapshot 内已有的接口、位宽和证据字段。

## 交互一致性

- 新增节点应复用现有 React Flow 节点、Inspector、Bus Detail、搜索和选择逻辑。
- 点击、悬停、下钻、返回、浏览器 Back/Forward 的行为在同类页面中保持一致。
- 修改布局后至少检查 100%、放大、缩小和窄窗口状态，避免文字被截断。
- 不删除现有 MEM、MXM、SXM、VXM、Program Load / DMA 或 Configuration 交互来规避布局问题。
