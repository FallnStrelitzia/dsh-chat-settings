# dsh-chat-settings

Per-conversation chat settings for DeepSeek Harness: a conversation-level system
prompt, a context window measured in turns, optional sampling overrides, and a
low-token "pure chat" mode. Ships with a dedicated empty chat workspace.

给单个对话加设置：对话级系统提示词、按轮数折叠上下文、可选的采样参数，以及低
token 的「纯聊天」模式，并可以一键创建一个专用于聊天的空工作区。

## Features / 功能

- **Conversation system prompt** — appended to the system prompt for one
  conversation only, without touching global settings.
  **对话级系统提示词**：只对当前对话生效，不改全局设置。
- **Context turns** — keep the most recent N turns; earlier ones are folded into
  a single notice once the budget is exceeded.
  **上下文条数**：只保留最近 N 轮，超出部分折叠成一条提示。
- **Sampling overrides** — temperature and max output tokens per conversation.
  **采样覆盖**：按对话设置温度与最大输出 token。
- **Pure chat mode** — switches the conversation to a persona-only preset with no
  tools and no runtime context, so a short greeting costs a fraction of the
  tokens of the standard agent.
  **纯聊天模式**：切换到只含人设的 preset，不加载工具与运行环境，短对话的 token
  消耗远低于标准模式。
- **Chat workspace** — creates an empty workspace dedicated to standalone chats.
  **对话空间**：创建一个只用于纯聊天的空工作区。
- **Workspace opt-in** — the per-conversation button only appears in workspaces
  you check in Settings, so other workspaces ignore the plugin entirely.
  **按工作区启用**：只有设置里勾选的工作区才显示对话设置按钮，其他工作区完全不受
  影响。

## Install / 安装

```sh
dsh plugin --profile <profile> add @local/dsh-chat-settings
```

Until the package is published, install from this directory with a `link:`
dependency in the profile `package.json`, then add the package name to
`dsh.profile.bundles`.

包发布前，可在 profile 的 `package.json` 里用 `link:` 依赖指向本目录，并把包名加入
`dsh.profile.bundles`。

## Usage / 使用

1. Open **Settings → Chat settings**, check the workspaces that should expose the
   feature.
   打开 **设置 → 对话设置**，勾选需要启用该功能的工作区。
2. A **Chat settings** button appears next to the conversation title (and in the
   new-session row).
   对话标题旁（以及新会话行）会出现 **对话设置** 按钮。
3. Set the prompt, context turns, and optional sampling values, then save.
   填写提示词、上下文条数、可选的采样参数并保存。
4. Tick **Pure chat mode** to switch that conversation to the persona-only
   preset; untick to switch back.
   勾选 **纯聊天模式** 可把该对话切到纯人设 preset，取消勾选切回原模式。

## Uninstall / 卸载

Pure-chat conversations record the plugin's preset id in their log header. Before
removing the plugin, open its detail page and click **Move chat sessions to
standard**, or open each pure-chat conversation and untick the mode. Removing
the plugin also detaches cold conversations automatically.

纯聊天会话会在日志头记录本插件的 preset id。移除插件前，请在插件详情页点击
**迁移纯聊天会话**，或逐个打开对话取消纯聊天模式。插件卸载时也会自动把未打开的
会话改回标准模式。

Plugin data lives in `$DSH_HOME/chat-settings/settings.json`; delete that
directory to remove it.

插件数据位于 `$DSH_HOME/chat-settings/settings.json`，删除该目录即可清除。

## Requirements / 依赖

- A DeepSeek Harness build that provides `dsh.bundle` plugin loading.
  **需要提供 `dsh.bundle` 插件加载能力的 DeepSeek Harness。**
- No third-party runtime dependencies.
  **不依赖第三方运行时包。**

## Package layout / 目录

```
index.js            Host half: storage, HTTP routes, prompt/context/tools hooks
client.js           Client half: settings dialog, settings page, detail action
cordis.patch.yml    Loader patch: the plugin row and its pure-chat preset
locale/             UI strings
icon.svg            Plugin icon
```

## License

MIT
