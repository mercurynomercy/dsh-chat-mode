# DSH 聊天模式插件：设计文档

日期：2026-11-08
目标平台：DeepSeek Harness（DSH）桌面端 **0.2.2-rc.1**，macOS（用户的主力机器）

## 1. 意图与为什么

DSH 现在只有"工作模式"：新会话总要挂在某个工作区（文件夹）下面，界面也是围绕"在项目里改代码"设计的。用户有时只想随便聊几句，像 Claude 桌面版的 Chat 那样，不想先选一个项目。

已经有人做过一个类似的插件（[Starp1ume/dsh-chat-mode](https://github.com/Starp1ume/dsh-chat-mode)），用户用过，觉得有两个问题：

1. **切到聊天要重新登录。** 那个插件的"聊天"其实是嵌了 chat.deepseek.com 官方网页，网页登录和 DSH 登录是两套。它靠把网页 `userToken` 明文存进 localStorage 来"记住登录"。
2. **UI 有问题。** 它往标题栏和侧栏上盖东西，用写死的像素常量（`TITLEBAR_LEFT_OFFSET = 154`、`CHAT_LAYER_TOP = 34`）定位，只在 Windows + 0.2.1-rc.5 上测过；用户在 Mac 上用。

本插件走另一条路：**聊天直接用 DSH 自己的会话、登录和模型**（用户选的是这个方向，即"B"），只是换一个干净的、不绑项目的聊天界面。

## 2. 目标

- 在 DSH 里提供一个"聊天"入口，进去后可以：新建聊天、看 Recents（最近聊天）、搜索聊天、继续之前的聊天。
- 聊天**不需要用户选择或绑定工作区**，也**不需要任何额外登录**。凭据和模型完全复用 DSH 已有的。
- 聊天用的模型：默认是 DSH 当前的默认模型（用户机器上是本地 MLX `main`），输入框里能切换模型，和工作模式的模型选择器一致。
- 聊天能做的事：普通对话、联网搜索、读用户拖进来的附件（图片和文件）。
- 工作模式（DSH 原本的界面和行为）**完全不变**。

## 3. 非目标

- 不嵌官方网页，不处理网页 token。
- 不做 Windows 专门适配（不排斥，但不验证）。
- 不做 Projects、Artifacts 这类 Claude 的其他功能。
- 不改 DSH 本体，不打补丁到 app.asar。

## 4. 反目标（即使能跑，这样也算失败）

- **DSH 小版本升级就坏。** 用户明确说"稳定比较重要"。所以不允许写死像素偏移，不靠 CSS 选择器去隐藏或盖住 DSH 的元素，不依赖 DSH 内部未公开的 DOM 结构。只用 DSH 公开的插件位（slot）和客户端 API。
- **切到聊天又要登录**，或者弹出任何额外的登录、凭据提示。
- **聊天会话里的模型能动用户的文件或执行命令。** 聊天会话不能有文件系统读写、bash/pwsh、子代理之类的工具。
- **聊天会话混进用户的项目列表**，比如 Movie、CutFinder 底下突然冒出一堆闲聊。
- 存储任何明文凭据。

## 5. 约束与已知事实（侦察结果）

以下来自对 `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar` 里 0.2.2-rc.1 自带包和 README 的阅读：

- **插件形态**：npm 包，`package.json` 里有 `dsh.bundle.patch`（cordis patch yml）和 `dsh.client`（`platform: web`、`inject` 列表）。Starp1ume 插件是可参考的结构样例，安装方式是 `dsh plugin --profile desktop add <路径或包名>`。用户的 profile 在 `~/.dsh/profiles/desktop/`。
- **侧栏入口**：`@deepseek-ai/dsh-client-ui-sidebar` 提供 root 作用域的 `sidebar.panellist` 列表 slot。插件注册 `{ id, order?, label }` 和一个图标组件后，同一个 `id` 对应布局里 root 作用域 `main` keyed slot 的组件，由 `ctx.layout.selectPanel(id)` 选中；`selectPanel(null)` 回到会话界面。这是用户选的方案 B 依赖的正式接口。
- **主面板**：`@deepseek-ai/dsh-client-ui-layout` 的 `main` keyed slot，`conversation` 这个 key 保留给会话界面。主面板页面可以用 `--dsh-frame-top-clearance`、`--dsh-frame-leading-clearance` 避开 macOS 红绿灯。
- **Agent preset**：DSH 有 preset 机制（standard / minimal / ptc / cordis / 自定义），由 `dsh-agent-preset-registry` 管理。bundle 可以声明新的 preset，preset 决定该会话装载哪些插件（也就决定了模型能用哪些工具）。新会话可以带 `agentPreset` 创建（`uiWorkspace.startSession(..., { agentPreset })`）。
- **会话必须有工作目录**：Host 的会话创建会使用工作区目录，没有时回退到"配置的默认目录"。侧栏在一个工作区都没选时也能进入空白新会话页。
- **会话列表**：`dsh-api-session-controller` 提供会话的创建、列表、搜索、历史、prompt，客户端通过 API Gateway 调用。
- **用户已登录 DeepSeek 账号**：DSH 侧栏底部显示"已登录 DeepSeek"，`~/.dsh/.credentials.yaml` 也存在。所以 `dsh-web-search-deepseek` 能拿到凭据，联网搜索不需要额外登录。
- **默认模型能力**：profile 里 MLX `main` 声明了 `input: [text, image]`，用户平时也拿它跑带工具的工作模式会话，所以图片输入和工具调用（联网搜索）都可以按"支持"来设计。模型不支持某项能力时，按 DSH 现有的模型能力提示处理，插件不另做检测。
- **附件的工作方式**：`dsh-attachment` 的规则是图片直接发给模型；非图片文件只给模型一行只读路径，要模型自己用文件工具去读。所以"不装文件工具"和"能读拖进来的文件"互相冲突，见 §6 第 6 条。
- 用户的 `~/.dsh/profiles/node_modules/@deepseek-ai/*` 是指向一个旧开发目录的软链，**不能**当作 API 参考；以 app.asar 里的 0.2.2-rc.1 包为准。

## 6. 已决定的"怎么做"

这些是和用户对过的，或用户认可了的：

1. **方案 B：用 DSH 侧栏的正式插件位。** dsh 原侧栏保留不动，在 `sidebar.panellist` 加一个"聊天"入口。点进去，主区域显示聊天面板：左边一栏是聊天专用列表（＋新聊天、搜索、Recents），右边是对话区。界面风格向 Claude 桌面版的 Chat 靠拢：空白页有居中的欢迎语和大输入框，输入框底部有 ＋附件、🌐联网、模型选择、发送。
2. **用 DSH 自己的会话系统**：每个聊天就是一个普通 DSH 会话，用户的登录和模型都不变。
3. **专用"聊天" preset**：插件 bundle 声明一个 preset（暂名 `chat`），只装对话需要的插件：模型、联网搜索（`dsh-web-search-deepseek` / `dsh-tool-web` 这一类）、附件读取，以及会话标题、压缩这类基础设施。**不装** fs、bash、pwsh、str-replace-editor、subagent、workflow、jobs、todo 这类工具。所有聊天会话都用这个 preset 创建。
4. **专用聊天目录**：聊天会话落在一个插件专属目录下（例如 `~/.dsh/chat-mode/`），不碰用户的项目。因为 preset 没有文件工具，这个目录只是会话的"户口"。
5. **默认模型** = DSH 当前默认模型，可以在输入框切换。
6. **非图片附件：给一个只读、只限附件的读文件工具**（用户选的）。`chat` preset 加一个只读文件工具，它的可访问范围被硬性限制在 DSH 附件存储里本会话的附件路径。不能写入，不能列目录，也不能读附件以外的任何路径，包括聊天目录和用户家目录。实现方式（对现有 fs 工具加沙箱或路径策略，或插件自带一个窄工具）由实现者决定，但必须满足以下两点：
   - 范围是硬限制，在 Host 侧强制执行，不能只写在 prompt 里叫模型"别读别的"；
   - 实现计划里要有测试证明：读附件成功，读 `~/Desktop` 之类的任意路径被拒绝。

   这一条是 §4 反目标"不能动用户的文件"的唯一例外，而且仅限于读取用户自己拖进这个聊天的文件。
7. **卸载后保留聊天记录**（设计者的决定）：卸载插件不删除任何会话，用户数据不能因为卸载而丢。卸载后聊天目录可能在工作区列表里显示成一个"聊天"分组，这是可以接受的残留。成功标准第 8 条只要求界面和样式恢复原状。
8. **从 DSH 原侧栏点开聊天也没问题**（设计者的决定）：如果走了 §7 的退一步方案，聊天在原侧栏里出现，点开后在工作模式的会话界面打开，这是可以接受的。会话仍然用 `chat` preset，所以照样没有文件和命令工具。不需要做跳转。

## 7. 留给实现者决定的

- 聊天面板里的对话区，是复用 DSH 自带的会话渲染组件（`ui-conversation` / `ui-chat` 提供的 slot 或导出），还是插件自己渲染。**优先复用**，这样 markdown、流式输出、附件预览、模型选择都和工作模式一致，也更稳。只有在 0.2.2-rc.1 没有公开可复用接口时才自己渲染，并在实现计划里写明。
- "聊天会话不出现在工作区列表"的具体做法。可选做法包括：专用目录不注册成工作区、利用 ui-workspace 已有的显隐规则，或其他公开机制。**底线**：不能靠 CSS 或 DOM 去隐藏。如果 0.2.2-rc.1 没有公开机制能做到完全隐藏，可以退一步，让聊天目录显示成一个名字叫"聊天"的工作区（一个干净的分组，而不是散在各项目里）。实现者要在计划里写明最终用了哪种做法。
- preset 的精确插件清单，以 0.2.2-rc.1 的 standard preset 为蓝本做减法。
- 联网搜索默认开还是关，以及开关的形态。
- 搜索和 Recents 的数据来源：用会话列表和搜索 API，按 preset 或目录过滤出聊天会话。
- 中英文文案（参考 Starp1ume 的 `locale/zh.json`、`locale/en.json` 结构）。
- 包名、目录结构、测试方式。

## 8. 成功标准

在用户的 Mac 上，DSH 0.2.2-rc.1：

1. 安装插件、完全退出并重启 DSH 后，侧栏出现"聊天"入口。
2. 点进去，不选工作区、不登录任何东西，就能发消息，并用默认模型得到回复。
3. 输入框能切换模型、加附件；需要时能联网搜索。
4. 让模型"列出我桌面上的文件"、"读 ~/.zshrc"或"运行 ls"，它做不到；但拖进来的 PDF 或文本文件它能读。
5. Recents 里能看到并继续之前的聊天，重启 DSH 后还在。
6. 工作区列表（Movie、CutFinder）里没有混进聊天；退一步的情况是只多一个"聊天"分组。
7. 切回工作模式（点 DSH 原有的会话或新会话），一切和装插件前一样。
8. 卸载插件后 DSH 恢复原状，没有残留的样式或界面。
