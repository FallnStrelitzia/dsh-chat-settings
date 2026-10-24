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
| Persona-only preset with no tools and no runtime context — a short greeting costs a fraction of the standard agent. | The settings button only appears in workspaces you check in Settings. |

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
4. Tick **Pure chat mode** to switch that conversation to the persona-only preset; untick to switch back.  
   勾选 **纯聊天模式** 切到纯人设 preset，取消勾选切回原模式。

<details>
<summary>What pure chat mode changes / 纯聊天模式改了什么</summary>

The conversation moves to `chat-settings-pure-chat`, a preset that mounts only a persona. No tools are offered to the model, and the plugin denies every globally registered tool inside that agent's scope. The system prompt is one persona line plus your instructions, filled in through a prompt variable at render time.

该对话切到 `chat-settings-pure-chat` preset：只挂一个人设，不给模型任何工具，并在该 agent 作用域内拒绝所有全局工具。系统提示只有一句人设加你的指令，指令通过提示词变量在渲染时填入。

</details>

## Uninstall

Pure-chat conversations record the preset id in their log header, so before removing the plugin either:

- open the plugin detail page and click **Move chat sessions to standard**, or
- open each pure-chat conversation and untick the mode.

Removing the plugin also detaches cold conversations automatically. Plugin data lives in `$DSH_HOME/chat-settings/settings.json`.

纯聊天会话会在日志头记录 preset id，卸载前请先在插件详情页点 **迁移纯聊天会话**，或逐个打开对话取消纯聊天模式。卸载时未打开的会话也会自动改回标准模式。插件数据位于 `$DSH_HOME/chat-settings/settings.json`。

## Package layout

```
index.js            Host half: storage, HTTP routes, prompt/context/tools hooks
client.js           Client half: settings dialog, settings page, detail action
cordis.patch.yml    Loader patch: the plugin row and its pure-chat preset
locale/             UI strings
icon.svg            Plugin icon
icon-180.png        Storefront icon
```

## Scope

Not a general chat client, not a theme, not a replacement for DSH's own sessions. It only shapes how one conversation is assembled before the model is called.

不是通用聊天客户端，不是主题，也不替代 DSH 自己的会话管理——它只决定一个对话在调用模型前如何组装。

## License

[MIT](LICENSE)
