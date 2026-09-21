# 点击进入统一查看器：v0.2.0 验证记录

日期：2026-09-21。v0.2.0 基于 v0.1.5 开发；以下记录来自开发期间的本机候选目录。
本机生产插件使用同一目录，发布前包版本更新为 0.2.0。

## 本轮范围

公式、Mermaid 正文只保留点击查看入口。移除正文工具栏、悬停／聚焦显露逻辑、
消息右侧复制图标和占位。统一查看器提供 Preview / Source、明确格式的复制、
Fit / 缩放及可恢复失败的 Retry。源码模式不显示图像缩放。

短公式 Fit 最多放大到阅读尺寸的 150%，弹窗采用内容高度。宿主 Modal.Content
独占竖向滚动，插件只增加横向 SDK ScrollView。公共 SDK 仍限制桌面弹窗宽度；
工作区宽画布、设置重组和界面本地化不在本轮范围。

## 自动检查

- build、typecheck、lint、format:check、git diff --check 通过。Lint 仅有两条既有 info。
- 定向测试合计 46 项通过：math-layout 28、viewer-identity 4、activation-gesture 11、viewer-keyboard 3。
- 官方 0.8.0 和 0.9.0-beta.2 compiler / SDK smoke 通过，两次均要求真实 Mermaid 渲染就绪。
- Hermes 默认参数与 `-Xes6-class` 两种模式通过。

没有运行全量测试。身份测试使用真实 Markdown parser，覆盖流式追加与重复内容；
现有构建已有稳定 React key，本次把查看器身份进一步与组件生命周期分离。

## 界面与复制实测

使用官方 0.9.0-beta.2 daemon、官方打包 web UI、Chrome 和候选目录插件。
daemon 位于独立临时 home，监听随机本机端口；mock agent 仅提供合成消息，
公式和图表通过真实插件 RPC 渲染。未调用模型，未操作生产服务。

| 项目 | 结果 |
| --- | --- |
| 行内公式、块公式、图表单击 | 进入同一结构的查看器 |
| 短公式 | 居中、默认 150%，弹窗不再占接近整窗高度 |
| 预览 / 源码切换 | 源码模式隐藏缩放，保留一枚主复制按钮 |
| 长公式 | Fit 完整显示，放大后可横向滚动 |
| 复制 LaTeX / Mermaid | 读回剪贴板，原始内容一致 |
| 复制 Markdown | 读回剪贴板，公式定界符和 Mermaid 围栏保留 |
| 复制所在片段 | 与测试消息原始 Markdown 逐字一致 |
| 无效公式 | 正文源码可点击；查看器显示错误和源码，可复制 |
| 拖动 | 行内／块公式拖动不打开，拖动后重新点击正常 |
| 键盘 | Enter、Space 可打开；Escape 关闭并回到入口，无正文工具栏 |
| 外观与宽度 | 浅色、深色、780px 窄工作区、390px 紧凑 web 布局检查通过 |

键盘实测发现 Space 按下后立即打开可能再次触发关闭，已改为捕获按键、
Space 释放时打开，并对行内与块公式重新实测通过。控制台未捕获应用错误，
仅有宿主 web notifications 与 Animated native-driver 提示。

本轮本机证据保存在忽略目录 `.smoke/click-viewer-2026-09-21/`：
`ui-results.json`、`formula-dark-final.png`、`source-light.png`、
`diagram-light.png`、`wide-fit-780.png`、`wide-zoom-scroll-780.png`、
`formula-compact-390.png`、`invalid-formula-light.png` 及兼容性检查日志。

## 本机生产回归：脚注导致整条回复不渲染

生产切换后的后端 RPC 检查通过，但用户的真实测试回复在 Electron 中仍显示原始 LaTeX。
原因是 Markdown 的普通引用定义规则把 `[^render-note]: 中文脚注说明` 当成链接定义，
将说明文字变成相对 URL。文件导航保护因此把整条消息交回宿主，公式和 Mermaid 都未被接管。

解析器现在把脚注定义行保留为普通段落并解析其中的行内公式，不创建脚注导航。
独立块规则只消费定义行，让紧接着的普通引用链接仍由原规则处理；实际文件链接与图片
仍保留给宿主。缩进的脚注续行保留为代码，其中公式不解析。

- 新增失败后修复的回归用例；`tests/parser.test.ts` 30 项通过，覆盖引用和列表中的相邻文件链接。
- build、typecheck、lint、format:check 和 diff 检查通过；Lint 仅有两条既有 info。
- 原始 6,945 字符回复从 `unsupported: true` 变为可接管，解析得到 31 个公式。
- 单独热重载生产插件后，在本机 Electron 看到公式图像，并点击打开 Preview / Source 查看器。
  原始 LaTeX 中的反斜杠、矩阵和超长公式由插件解析，脚注正文保留。
- 未重启主 daemon。证据位于 `.smoke/render-repair/`，包括原始消息、时间线、
  `electron-reading.png` 和 `electron-viewer.png`。

## 鼠标拖动长公式

用户确认问题出现在按住公式左右拖动。原交互只抑制拖动后的点击，没有移动滚动容器。
正文公式和查看器图片预览现在共用横向拖动容器：超过 6px 才开始横移，松开后不触发
打开；下一次单击仍可打开。源码视图保持文字选择，原生端不安装浏览器事件处理。

- `tests/horizontal-drag.test.ts` 9 项通过，覆盖双端夹紧、拖回原位、单击恢复、
  不溢出、拖动中卸载清理，以及 iOS / Android 不访问 DOM。
- 用同一原始回复在隔离的官方 0.9.0-beta.2 web 客户端执行真实鼠标拖动，
  正文 `scrollLeft` 从 0 变为 400（可视宽 804，内容宽 1530），未弹出查看器。
- 拖动后单击正常打开；放大预览后 `scrollLeft` 从 0 变为 250
  （可视宽 486，内容宽 746）。Source 的 `user-select` 仍为 `text`。
- 生产插件已单独热重载，主 daemon PID 未变。临时 QA daemon 和浏览器页已关闭。
- 证据位于 `.smoke/drag-scroll-repair/`：`results.json`、`body-drag.png`、`viewer-drag.png`。

本轮 Electron 拖动复测未完成：窗口捕获仅返回 Stage Manager 缩略图，置前时工具报告
ScreenCaptureKit 错误；以上实际拖动证据来自官方浏览器客户端，不作为 Electron 实测。

## 代码块鼠标拖动

插件接管的消息中，桌面超宽代码块默认支持鼠标拖动。动作栏的 **Select text**
切换为局部文字选择，**Drag to scroll** 切回拖动；两种模式都保留 **Copy source**。
未溢出的代码、紧凑布局与原生端继续使用原有选择和滚动方式。未接管的消息仍由宿主渲染。

在隔离的官方 0.9.0-beta.2 web 客户端使用 Chrome 实测：

- 代码可视宽 782、内容宽 3085，拖动使 `scrollLeft` 从 0 变为 400。
- 切到选择模式后，拖选并按 Cmd+C 得到 24 字符片段，滚动位置保持 400。
- 两种模式的整块复制都与原始 415 字符源码逐字一致，包括缩进、尾部空格和换行。
- 切回拖动后，`scrollLeft` 从 400 变为 700；短代码保持可选择。
- 390px 紧凑布局不显示模式切换，长代码仍可选择；控制台未出现错误。
- build、typecheck、lint 通过。证据在 `.smoke/code-drag-repair/`，包括
  `results.json`、`drag.png` 和 `compact.png`。此项没有新增 Electron 真机验证。

## 原生端高行内公式重叠

用户提供的 iPhone 截图显示高分式覆盖前一行。RN 0.81 的 iOS attachment 路径不把
包裹图片的嵌套 Text 行高应用到段落，基线位移也不增加布局占位。只改公式 Text 的
`lineHeight` 无法保证原生排版安全。

最初将所有超出原行高的公式独立成行，用户后续截图确认不再重叠，但普通分数、
上下标和求和被拆出句子，标点落在下一行。当前改为保留普通公式，仅将需要超过
两倍基础行高的公式独立成行。每段连续文字按其中公式的实际高度预留行距，递归统一
全部 Text 子节点的行高，包括粗体、链接和公式源码占位；高公式不扩大前后文字段的行距。

原生公式内使用零宽文字承载段落属性，涵盖以公式开头或只有公式的文字段。
原生选择复制可能包含 U+200B；查看器的显式复制仍读取原始源码。图片等待所属文字段
分配足够行高后才绘制，升格判定始终使用原始基础行高，避免布局反馈。
独立公式与相邻闭合标点放在同一滚动容器中；失败占位也保留标点。网页端维持原有行高计算。

- 截图普通分数、上下标、求和在 150% 下所需行高为 47 / 46 / 43，保留行内。
- 高分式真实尺寸为 170 × 57.5，基线 26.4902；五档公式比例仍独立成行。
- 定向测试 67 项通过：math-layout 46、inline-segments 18、inline-text 3，覆盖系统字号、
  临界高度、递归文字样式、标点保留及前后文顺序。
- build、typecheck、lint、Hermes 两种运行模式通过。早期重叠证据在
  `.smoke/native-inline-height-repair/`，当前排版度量与回归证据在 `.smoke/native-inline-flow-repair/`。
- 官方浏览器客户端验证独立公式的逗号位于同一滚动容器，后续文字不再以逗号开头；
  点击查看器和复制原始 Markdown 通过，控制台无错误。
- 当前调整仍未完成 iPhone 真机复测；本机没有可用的 iOS 模拟器，上述验证不等同原生 UI 实测。

## 未覆盖

未把浏览器紧凑布局视为 iOS／Android 真机通过。
未注入系统剪贴板拒绝、离线／字体失败或高密度 PNG 解码失败。
加载／失败的状态同步和高清失败保留已有图片经过代码审查，尚需对应故障注入实测。
