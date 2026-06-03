# Hermes Chat 轻量 MVC 重构计划

## Context

当前代码的主要维护压力不是技术栈选错，而是业务边界混在了一起：

- `src/components/chat/ChatView.tsx` 同时负责 View、发送流程、Hermes 同步、审批处理、文件选择和流式状态。
- `src/screens/MainScreen.tsx` 同时负责页面布局、会话抽屉、Prompt 面板、远端会话导入和 Zustand 直接写入。
- `src/components/SettingsPanel.tsx` 同时负责表单渲染、配置解析、Hermes 探测、模型/能力/会话/任务拉取。
- `src/store/app.ts` 同时包含默认数据、业务动作、远端消息转换和 UI 运行时快照。
- 常量和默认值分散在 `types`、`services`、`store`、组件内部，导致端口、轮询间隔、默认模型、默认 Prompt 等规则不容易定位。

建议采用轻量 MVC，而不是引入完整 Clean Architecture 或复杂 DI：

- Model：`src/domain/*` + `src/store/*`，只表达业务数据、默认值、纯转换和状态动作。
- View：`src/components/*` + `src/screens/*`，只负责展示和用户输入。
- Controller：`src/features/*/use*Controller.ts`，用 React hook 承接页面流程、服务调用和副作用。
- Services：`src/services/llm/*`，只负责 Hermes Gateway / Runs / Sessions / Jobs 的网络边界。

Expo SDK 56 仍按当前 Expo Router / React Native 项目方式推进，不需要为了分层改导航或框架。

## Approach

1. 先收敛常量和默认值

   新增 `src/config/app-constants.ts`，放稳定运行时常量：

   - `HERMES_GATEWAY_PORT`
   - `HERMES_CHAT_ENDPOINT_PATH`
   - `DEFAULT_MODEL`
   - `DEFAULT_SESSION_TITLE`
   - `REACHABILITY_POLL_MS`
   - `SNAPSHOT_POLL_MS`
   - `SNAPSHOT_REQUEST_TIMEOUT_MS`
   - `STREAM_FLUSH_MS`
   - `SYNTHETIC_STREAM_CHUNK_SIZE`
   - `SYNTHETIC_STREAM_TICK_MS`
   - `STICK_TO_BOTTOM_MS`
   - `WELCOME_AUTO_DISMISS_MS`
   - `NARROW_BREAKPOINT`

   新增 `src/domain/settings/defaults.ts` 放 `DEFAULT_SETTINGS`、默认 system prompt、默认 endpoint 组装。`src/types/index.ts` 保留类型，逐步移除默认业务对象，避免类型文件继续变成配置桶。

2. 抽出 domain 纯函数，先不改状态结构

   新增：

   - `src/domain/chat/messages.ts`：承接 `makeUserMessage`、`makeAssistantMessage`、消息 id/time 工厂。
   - `src/domain/chat/remote-session.ts`：统一远端 session/message 归一化、排序、去重和标题兜底。
   - `src/domain/prompts/defaults.ts`：承接内置 prompt seed。

   这样 UI、store、同步逻辑都调用同一套转换规则，不再各自 map `remote.messages as any[]`。

3. 把 Zustand 明确当作 Model

   `src/store/app.ts` 保持现有持久化 shape，第一阶段不做 schema migration。只做两类整理：

   - 用 domain defaults 初始化 conversations/prompts/settings。
   - 增加显式 action，例如 `importRemoteSession(...)`、`mergeRemoteMessages(...)`、`applyHermesSnapshot(...)`。

   组件里避免直接 `useAppStore.setState` 拼业务数据。确实需要低层写入时，也包进 store action，方便后续查行为入口。

4. 用 Controller hook 承接 ChatView 的业务流程

   新增 `src/features/chat/useChatController.ts`，移动以下逻辑：

   - send / stop / edit-resend
   - stream chunk flush 和 fallback
   - approval resolve / deny
   - sync from Hermes
   - pending files 管理和文件选择入口

   `ChatView` 保留消息列表、输入区、文件卡片、审批弹窗的组合。它只消费 controller 暴露的状态和 action，不直接知道 Hermes 客户端细节。

5. 用 Controller hook 承接 SettingsPanel 的探测流程

   新增 `src/features/settings/useSettingsController.ts`，移动：

   - endpoint/model 保存前解析
   - `fetchModels`
   - `fetchCapabilities`
   - `fetchSkills`
   - `fetchToolsets`
   - `fetchSessions`
   - `fetchJobs`

   同时新增 `src/services/llm/factory.ts`，提供 `buildLLMConfig(settings)` 和 typed client factory，消除 Settings、Snapshot、Chat 中重复的 `new Hermes*Client({ ... })`。

6. 拆 MainScreen 的布局，不动业务行为

   从 `src/screens/MainScreen.tsx` 抽出：

   - `src/components/layout/DesktopLayout.tsx`
   - `src/components/layout/SessionDrawer.tsx`
   - `src/components/layout/PromptSheet.tsx`

   `MainScreen` 最终只保留页面级 orchestration：当前 conversation、drawer/sheet 开关、reachability polling、controller 组合。

7. 拆文件选择和文件展示

   `src/components/chat/FileCard.tsx` 只保留展示组件。把 `pickFile`、web/native 分支、`guessKindFromName` 移到 `src/features/attachments/filePicker.ts`。这是业务动作，不应该藏在展示卡片里。

推荐分三次提交推进，降低风险：

1. constants + domain defaults + service factory，只改引用，不改行为。
2. Settings controller + MainScreen layout extraction。
3. Chat controller + attachment picker extraction。

不建议当前阶段做这些事：

- 不引入 class controller、DI container、repository 抽象。
- 不把 Zustand 换成 Redux / XState。
- 不一次性重命名所有目录或改 persisted store schema。
- 不为了 MVC 拆出过细的文件，例如每个按钮一个 controller。

## Key Files

| Path | Change |
| --- | --- |
| `src/config/app-constants.ts` | 新增运行时常量和默认端口/path。 |
| `src/domain/settings/defaults.ts` | 新增默认 settings、system prompt、endpoint 组装。 |
| `src/domain/chat/messages.ts` | 新增消息工厂，替代 `src/utils/messages.ts`。 |
| `src/domain/chat/remote-session.ts` | 新增远端 session/message 归一化和 merge helper。 |
| `src/domain/prompts/defaults.ts` | 新增内置 prompts seed。 |
| `src/store/app.ts` | 使用 domain defaults，并新增显式业务 action。 |
| `src/services/llm/factory.ts` | 新增 LLM config builder 和 Hermes typed client factory。 |
| `src/features/chat/useChatController.ts` | 新增聊天流程 controller hook。 |
| `src/features/settings/useSettingsController.ts` | 新增设置页探测和保存 controller hook。 |
| `src/components/chat/ChatView.tsx` | 收敛为 View，删除服务调用和复杂副作用。 |
| `src/components/SettingsPanel.tsx` | 收敛为 View，删除 Hermes fetch 细节。 |
| `src/screens/MainScreen.tsx` | 抽出布局组件，保留页面协调。 |

## Verification

每一阶段都用小步验证，不等全部重构完再测：

- `npx tsc --noEmit`
- `npx expo install --check`
- `git diff --check`
- `npx expo start --web --port 8082`

Web smoke 重点路径：

- 新建会话、发送消息、stop streaming。
- edit-resend 后不重复插入 user message。
- Settings 打开、保存 endpoint/model、刷新 models/capabilities/skills/toolsets/sessions/jobs。
- Hermes 不可达时 UI 仍能离线工作，错误提示不阻塞本地聊天。
- 从远端 session 导入和同步后，消息顺序、id 去重、title 兜底保持一致。
- Prompt 插入和 Prompt Sheet 打开关闭行为不变。

最终验收标准：

- `ChatView.tsx`、`SettingsPanel.tsx`、`MainScreen.tsx` 明显变薄，主要逻辑迁入 controller/domain。
- 默认值和常量能从 `src/config` 或 `src/domain/*/defaults.ts` 一处找到。
- 服务调用只从 controller/store effect 层发起，展示组件不直接 new Hermes client。
- 没有引入新的框架级复杂度，现有 Expo SDK 56 运行方式不变。
