<p align="center">
  <img src="icon-180.png" alt="dsh-chat-settings" width="120" height="120" />
</p>
<h1 align="center">dsh-chat-settings</h1>
<h3 align="center">Per-conversation chat settings for DeepSeek Harness.</h3>

<p align="center">Give one conversation its own system prompt, fold older turns out of context, override sampling, and switch it into a low-token pure chat mode — without touching global settings.</p>
<p align="center">给单个对话加设置：对话级系统提示词、按轮数折叠上下文、采样参数，以及低 token 的纯聊天模式——不改全局配置。</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="MIT License" /></a>
  <a href="https://www.npmjs.com/package/@fallnstrelitzia/dsh-chat-settings"><img src="https://img.shields.io/npm/v/@fallnstrelitzia/dsh-chat-settings?style=flat-square&color=0891b2" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@fallnstrelitzia/dsh-chat-settings"><img src="https://img.shields.io/npm/dm/@fallnstrelitzia/dsh-chat-settings?style=flat-square&color=0ea5e9" alt="npm downloads" /></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/topic-dsh--plugin-8b5cf6?style=flat-square" alt="dsh-plugin topic" /></a>
  <a href="https://github.com/FallnStrelitzia/dsh-chat-settings"><img src="https://img.shields.io/badge/host-DeepSeek%20Harness-2f6fed?style=flat-square" alt="DeepSeek Harness" /></a>
</p>

## What it does

| Conversation settings | Context control |
|---|---|
| A system prompt that belongs to one conversation only. | Keep the latest N turns; older ones fold into a single notice. |
| **Pure chat mode** | **Workspace opt-in** |
| Assemble the conversation with only its own instructions: no tools, no runtime context — a short greeting costs a fraction of the standard agent. | The settings button only appears in workspaces you check in Settings. |

## Install

**From npm** — published as [`@fallnstrelitzia/dsh-chat-settings`](https://www.npmjs.com/package/@fallnstrelitzia/dsh-chat-settings):

```sh
dsh plugin --profile <profile> add @fallnstrelitzia/dsh-chat-settings
```

Or install the package itself with `npm i @fallnstrelitzia/dsh-chat-settings`.

**从 npm 安装**：运行上面的 `dsh plugin add`，或直接 `npm i @fallnstrelitzia/dsh-chat-settings`。

**From a checkout** — point `dependencies` in the profile `package.json` at this directory with `link:` and add the package name to `dsh.profile.bundles`.

**从本地目录安装**：把 profile `package.json` 的依赖写成 `"@fallnstrelitzia/dsh-chat-settings": "link:<this-dir>"`，并把包名加入 `dsh.profile.bundles`。

## Use

1. **Settings → Chat settings** — check the workspaces that should expose the feature.  
   打开 **设置 → 对话设置**，勾选需要启用该功能的工作区。
2. A **Chat settings** button appears next to the conversation title and in the new-session row.  
   对话标题旁、新会话行会出现 **对话设置** 按钮。
3. Set the prompt, context turns and optional sampling values, then save.  
   填写提示词、上下文条数、可选采样参数并保存。
4. Tick **Pure chat mode** to assemble that conversation without tools or runtime context; untick to return to the standard prompt.  
   勾选 **纯聊天模式**，该对话的请求只保留自己的指令、不加载工具和环境上下文；取消勾选回到标准系统提示。

<details>
<summary>What pure chat mode changes / 纯聊天模式改了什么</summary>

Pure chat is assembled at request time, not by switching presets. The plugin keeps only this conversation's instructions in the system prompt, clears the tool declarations on every request, and filters runtime context, skill catalog, workspace instructions and time readings out of the request. Nothing is written to the Session log, so removing the plugin leaves no Session pointing at a plugin-owned identity.

纯聊天在请求组装时完成，不切换 preset：系统提示只保留本对话的指令，每次请求都不携带工具声明，runtime 上下文、skill 目录、工作区指令和时间读数在请求里被过滤掉。这些都不写进会话日志，因此卸载插件不会留下指向插件私有身份的会话。

Leaving pure chat restores the full prompt and tool list on the next request. If a conversation refuses tool calls after the switch, open a new conversation: DSH's tool ledger treats a series that starts without tools as having no reusable baseline.

关闭纯聊天后的下一次请求会带回完整系统提示和工具列表。如果切换后该对话仍拒绝工具调用，开一个新对话即可——DSH 的工具账本会把“一开始就没有工具”的请求系列视为没有可复用基线。

</details>

## Uninstall

Nothing to migrate. Pure chat is a request-time override: the Session log never records a plugin-owned preset, so removing the plugin simply returns every conversation to the standard prompt and tools. Plugin data lives in `$DSH_HOME/chat-settings/settings.json` and can be deleted by hand.

不需要迁移。纯聊天是请求期覆盖：会话日志从不记录插件私有的 preset，卸载插件后所有对话直接回到标准系统提示和工具。插件数据位于 `$DSH_HOME/chat-settings/settings.json`，可以直接删除。

Older versions (1.1.x and below) did switch pure-chat Sessions to a preset. On first start, 1.2.0 appends a final `standard` selection to any such Session log once; the preset identity is never registered again.

旧版本（1.1.x 及以下）会把纯聊天会话切到一个 preset。1.2.0 首次启动时会给这类会话日志追加一条最终的 `standard` 选择，之后不再注册那个 preset。

## Package layout

```
index.js            Host half: storage, HTTP routes, prompt/context/tools hooks
client.js           Client half: settings dialog and settings page
cordis.patch.yml    Loader patch: the plugin row
locale/             UI strings
icon.svg            Plugin icon
icon-180.png        Storefront icon
```

## Scope

Not a general chat client, not a theme, not a replacement for DSH's own sessions. It only shapes how one conversation is assembled before the model is called.

不是通用聊天客户端，不是主题，也不替代 DSH 自己的会话管理——它只决定一个对话在调用模型前如何组装。

## Acknowledgements

The request-time pure-chat approach — suppressing prompt sections, tool declarations, runtime context and time readings instead of switching presets — was informed by [dsh-persona-select](https://github.com/gosutry/dsh-persona-select) by gosutry. Its use of `systemPrompt.suppressRuntimeContext()` and its `agent/pre-step` filtering pattern shaped this implementation.

纯聊天的请求期屏蔽方案（不切换 preset，而是在组装请求时压掉系统提示段、工具声明、runtime 上下文和时间读数）参考了 [dsh-persona-select](https://github.com/gosutry/dsh-persona-select)。它的 `systemPrompt.suppressRuntimeContext()` 用法和 `agent/pre-step` 过滤方式影响了这里的实现。

## License

[MIT](LICENSE)
