/**
 * @fallnstrelitzia/dsh-chat-settings — Client half.
 *
 * Adds a per-conversation settings dialog next to the Session title (only in
 * Workspaces the user checked) and a "Chat settings" page in Settings that owns
 * the Workspace check list plus the dedicated empty "Chat" workspace. All state
 * lives in the Host half; this module only renders and posts to its three JSON
 * routes.
 *
 * Written as plain JavaScript without a build step: `require('react')` is the
 * only runtime import, and every visible string comes from the locale bundle
 * registered below.
 */

window.__ModuleLoader__.load({
  id: '@fallnstrelitzia/dsh-chat-settings',
  factory(require) {
    const React = require('react')
    const { Fragment, useEffect, useRef, useState } = React
    const h = React.createElement

    const NS = 'chatSettings'
    const SETTINGS_PATH = 'api/chat-settings'
    const WORKSPACE_PATH = 'api/chat-settings/workspace'
    const WORKSPACES_PATH = 'api/chat-settings/workspaces'

    const en = {
      open: 'Chat settings',
      configured: 'Configured',
      title: 'Chat settings',
      subtitle: 'These settings apply only to this conversation.',
      systemPrompt: 'System prompt',
      systemPromptHint: 'Appended after the Harness system prompt, for this conversation only.',
      systemPromptPlaceholder: 'e.g. You are my writing assistant. Keep answers short and concrete.',
      contextLimit: 'Context turns',
      contextLimitHint: 'Keep the most recent N conversation turns (0 = unlimited). Earlier turns are folded once the budget is exceeded.',
      temperature: 'Temperature',
      temperatureHint: 'Leave empty for the model default.',
      maxTokens: 'Max output tokens',
      maxTokensHint: 'Leave empty for the model default.',
      pureChat: 'Pure chat mode',
      pureChatHint: 'Assemble this conversation with only its own instructions: no tools, no environment context, far fewer request tokens.',
      save: 'Save',
      saving: 'Saving…',
      cancel: 'Cancel',
      close: 'Close',
      reset: 'Reset',
      saved: 'Saved',
      loading: 'Loading…',
      loadFailed: 'Could not load the settings.',
      saveFailed: 'Could not save the settings.',
      invalidNumber: 'Enter a number, or leave the field empty.',
      workspace: 'Chat space',
      workspaceHint: 'Open an empty workspace for standalone conversations',
      workspaceBusy: 'Opening…',
      workspaceFailed: 'Could not open the chat space.',
      sectionTitle: 'Chat settings',
      sectionHint: 'Only checked Workspaces show the "Chat settings" button; every other Workspace ignores this plugin.',
      workspacesTitle: 'Enabled Workspaces',
      noWorkspaces: 'No Workspaces yet.',
      toggleFailed: 'Could not save the Workspace switch.',
      checkAll: 'Enable all',
      uncheckAll: 'Disable all',
    }

    const zh = {
      open: '对话设置',
      configured: '已配置',
      title: '对话设置',
      subtitle: '这些设置只对当前对话生效。',
      systemPrompt: '系统提示词',
      systemPromptHint: '追加在 Harness 系统提示之后，仅影响本对话。',
      systemPromptPlaceholder: '例如：你是我的写作助手，回答要简洁、具体。',
      contextLimit: '上下文条数',
      contextLimitHint: '保留最近 N 轮对话（0 = 不限制）。超过后更早的轮次会被折叠。',
      temperature: '温度',
      temperatureHint: '留空则使用模型默认值。',
      maxTokens: '最大输出 Token',
      maxTokensHint: '留空则使用模型默认值。',
      pureChat: '纯聊天模式',
      pureChatHint: '只保留本对话的指令来组装请求：不加载工具和环境上下文，请求 token 大幅下降。',
      save: '保存',
      saving: '保存中…',
      cancel: '取消',
      close: '关闭',
      reset: '重置',
      saved: '已保存',
      loading: '加载中…',
      loadFailed: '无法读取设置。',
      saveFailed: '无法保存设置。',
      invalidNumber: '请填数字，或留空。',
      workspace: '对话空间',
      workspaceHint: '创建一个空工作区，专用于纯对话',
      workspaceBusy: '正在打开…',
      workspaceFailed: '无法打开对话空间。',
      sectionTitle: '对话设置',
      sectionHint: '只有勾选的工作区才会显示「对话设置」按钮；其他工作区完全不受此插件影响。',
      workspacesTitle: '启用的工作区',
      noWorkspaces: '还没有工作区。',
      toggleFailed: '无法保存工作区开关。',
      checkAll: '全部启用',
      uncheckAll: '全部关闭',
    }

    const CSS = [
      '.dshcs-icon{display:block;flex:none}',
      '.dshcs-hero{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:0;border-radius:999px;',
      'background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.08));color:var(--dsw-alias-label-primary,#fff);',
      'font:inherit;font-size:13px;line-height:1;cursor:pointer;transition:background 120ms ease,opacity 120ms ease}',
      '.dshcs-hero:hover{background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2,rgba(255,255,255,.14)))}',
      '.dshcs-hero:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dshcs-head{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px;border-radius:6px;',
      'border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);',
      'font:inherit;font-size:12px;line-height:1;cursor:pointer;transition:background 120ms ease,color 120ms ease}',
      '.dshcs-head:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dshcs-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dshcs-dot{width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-brand-primary);flex:none}',
      '.dshcs-backdrop{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;',
      'padding:24px;background:rgba(0,0,0,.42);pointer-events:auto}',
      '.dshcs-dialog{width:min(560px,100%);max-height:min(86vh,760px);overflow:auto;box-sizing:border-box;',
      'padding:20px;border-radius:12px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);',
      'backdrop-filter:blur(20px) saturate(120%);-webkit-backdrop-filter:blur(20px) saturate(120%);',
      'color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);',
      'box-shadow:0 24px 64px rgba(0,0,0,.36)}',
      '.dshcs-head-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:4px}',
      '.dshcs-title{font-size:15px;line-height:22px;font-weight:600}',
      '.dshcs-subtitle{margin-top:2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dshcs-close{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border:0;border-radius:6px;',
      'background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;padding:0}',
      '.dshcs-close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dshcs-field{display:flex;flex-direction:column;gap:6px;margin-top:16px;min-width:0}',
      '.dshcs-label{font-size:13px;line-height:18px;font-weight:500}',
      '.dshcs-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.dshcs-textarea,.dshcs-input{width:100%;box-sizing:border-box;border-radius:8px;',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);',
      'font:inherit;font-size:13px;line-height:20px;outline:none}',
      '.dshcs-textarea{min-height:104px;padding:8px 10px;resize:vertical}',
      '.dshcs-input{height:34px;padding:0 10px}',
      '.dshcs-textarea:focus,.dshcs-input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.dshcs-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
      '.dshcs-error{margin-top:12px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}',
      '.dshcs-notice{margin-top:12px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-success-primary)}',
      '.dshcs-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:20px}',
      '.dshcs-btn{height:30px;padding:0 14px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);',
      'background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}',
      '.dshcs-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dshcs-btn:disabled{opacity:.55;cursor:default}',
      '.dshcs-btn.primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.dshcs-btn.primary:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dshcs-btn.ghost{margin-right:auto;border-color:transparent;color:var(--dsw-alias-label-secondary)}',
      '.dshcs-foot{display:flex;align-items:center;gap:10px;width:100%;height:42px;padding:0 10px;border:0;border-radius:10px;',
      'box-sizing:border-box;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:14px;',
      'line-height:1;cursor:pointer;text-align:left;transition:background 120ms ease,color 120ms ease}',
      '.dshcs-foot.compact{justify-content:center;width:42px;padding:0}',
      '.dshcs-foot:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dshcs-foot:disabled{opacity:.55;cursor:default}',
      '.dshcs-ws{display:flex;align-items:center;gap:10px;padding:7px 0;cursor:pointer}',
      '.dshcs-ws input{width:14px;height:14px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer;flex:none}',
      '.dshcs-ws-body{display:flex;flex-direction:column;gap:1px;min-width:0}',
      '.dshcs-ws-name{font-size:13px;line-height:18px;color:var(--dsw-alias-label-primary)}',
      '.dshcs-ws-path{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);word-break:break-all}',
      '.dshcs-ws-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:18px 0 2px}',
      '.dshcs-ws-group{display:flex;gap:6px}',
      '.dshcs-section{display:flex;flex-direction:column;min-width:0}',
      '.dshcs-check{display:flex;align-items:flex-start;gap:10px;margin-top:18px;cursor:pointer}',
      '.dshcs-check input{margin-top:3px;width:14px;height:14px;flex:none;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}',
    ].join('')

    /** Module-scoped dialog state: survives header re-mounts during streaming. */
    const dialogStore = {
      state: { open: false, sessionId: null, revision: 0 },
      listeners: new Set(),
      get() {
        return this.state
      },
      subscribe(listener) {
        this.listeners.add(listener)
        return () => {
          this.listeners.delete(listener)
        }
      },
      set(patch) {
        this.state = { ...this.state, ...patch }
        for (const listener of [...this.listeners]) listener()
      },
      open(sessionId) {
        this.set({ open: true, sessionId })
      },
      close() {
        this.set({ open: false })
      },
      touch() {
        this.set({ revision: this.state.revision + 1 })
      },
    }

    function useDialogStore() {
      const [snapshot, setSnapshot] = useState(dialogStore.get())
      useEffect(() => dialogStore.subscribe(() => setSnapshot(dialogStore.get())), [])
      return snapshot
    }

    function icon(props) {
      return h('svg', {
        className: 'dshcs-icon',
        viewBox: props.viewBox || '0 0 16 16',
        width: props.size || 14,
        height: props.size || 14,
        'aria-hidden': true,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: props.strokeWidth || 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }, props.children)
    }

    async function requestJson(path, init) {
      const response = await fetch(path, {
        credentials: 'same-origin',
        cache: 'no-store',
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(init && init.headers ? init.headers : {}),
        },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `HTTP ${response.status}`)
      }
      return payload
    }

    function toDraft(settings) {
      return {
        systemPrompt: typeof settings?.systemPrompt === 'string' ? settings.systemPrompt : '',
        contextLimit: typeof settings?.contextLimit === 'number' ? String(settings.contextLimit) : '0',
        temperature: typeof settings?.temperature === 'number' ? String(settings.temperature) : '',
        maxTokens: typeof settings?.maxTokens === 'number' ? String(settings.maxTokens) : '',
        pureChat: settings?.pureChat === true,
      }
    }

    function fromDraft(draft) {
      const parse = (raw) => {
        const text = String(raw ?? '').trim()
        if (text === '') return null
        const value = Number(text)
        return Number.isFinite(value) ? value : Number.NaN
      }
      const contextLimit = parse(draft.contextLimit) ?? 0
      const temperature = parse(draft.temperature)
      const maxTokens = parse(draft.maxTokens)
      if (Number.isNaN(contextLimit) || Number.isNaN(temperature) || Number.isNaN(maxTokens)) {
        return { error: 'invalid-number' }
      }
      return {
        settings: {
          systemPrompt: draft.systemPrompt,
          contextLimit: Math.max(0, Math.round(contextLimit)),
          temperature,
          maxTokens: maxTokens === null ? null : Math.round(maxTokens),
          pureChat: draft.pureChat === true,
        },
      }
    }

    function field(key, label, hint, control) {
      return h('div', { className: 'dshcs-field', key }, [
        h('div', { className: 'dshcs-label', key: 'label' }, label),
        control,
        h('div', { className: 'dshcs-hint', key: 'hint' }, hint),
      ])
    }

    function SettingsDialog(props) {
      const { t, sessionId, onClose, onSaved } = props
      const [draft, setDraft] = useState(null)
      const [status, setStatus] = useState('loading')
      const [saving, setSaving] = useState(false)
      const [error, setError] = useState(null)
      const [notice, setNotice] = useState(false)
      const closeRef = useRef(null)

      useEffect(() => {
        let alive = true
        setStatus('loading')
        setError(null)
        requestJson(`${SETTINGS_PATH}?sessionId=${encodeURIComponent(sessionId)}`)
          .then((payload) => {
            if (!alive) return
            const next = toDraft(payload.settings)
            setDraft(next)
            setStatus('ready')
          })
          .catch((reason) => {
            if (!alive) return
            setError(reason instanceof Error ? reason.message : String(reason))
            setStatus('failed')
          })
        return () => {
          alive = false
        }
      }, [sessionId])

      useEffect(() => {
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          }
        }
        window.addEventListener('keydown', onKeyDown)
        const timer = window.setTimeout(() => {
          closeRef.current?.focus?.()
        }, 0)
        return () => {
          window.removeEventListener('keydown', onKeyDown)
          window.clearTimeout(timer)
        }
      }, [onClose])

      const edit = (key) => (event) => {
        const value = event.target.value
        setDraft((current) => ({ ...(current || toDraft({})), [key]: value }))
        setNotice(false)
        setError(null)
      }

      const save = async () => {
        if (saving || !draft) return
        const parsed = fromDraft(draft)
        if (parsed.error === 'invalid-number') {
          setError(t('invalidNumber'))
          return
        }
        setSaving(true)
        setError(null)
        try {
          const payload = await requestJson(SETTINGS_PATH, {
            method: 'POST',
            body: JSON.stringify({ sessionId, settings: parsed.settings }),
          })
          setDraft(toDraft(payload.settings))
          if (typeof onSaved === 'function') onSaved(payload.configured === true)
          setNotice(true)
        } catch (reason) {
          setError(`${t('saveFailed')} ${reason instanceof Error ? reason.message : String(reason)}`)
        } finally {
          setSaving(false)
        }
      }

      const reset = () => {
        setDraft(toDraft({}))
        setNotice(false)
        setError(null)
      }

      return h('div', {
        className: 'dshcs-backdrop',
        role: 'presentation',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) onClose()
        },
      }, h('div', {
        className: 'dshcs-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('title'),
      }, [
        h('div', { className: 'dshcs-head-row', key: 'head' }, [
          h('div', { key: 'titles' }, [
            h('div', { className: 'dshcs-title', key: 'title' }, t('title')),
            h('div', { className: 'dshcs-subtitle', key: 'subtitle' }, t('subtitle')),
          ]),
          h('button', {
            key: 'close',
            ref: closeRef,
            type: 'button',
            className: 'dshcs-close',
            onClick: onClose,
            'aria-label': t('close'),
          }, icon({ children: h('path', { d: 'M4 4l8 8M12 4l-8 8' }) })),
        ]),

        status === 'loading'
          ? h('div', { className: 'dshcs-hint', key: 'loading' }, t('loading'))
          : null,
        status === 'failed'
          ? h('div', { className: 'dshcs-error', key: 'loadError' }, `${t('loadFailed')} ${error || ''}`)
          : null,

        status === 'ready' && draft
          ? h(Fragment, { key: 'form' }, [
            field('prompt', t('systemPrompt'), t('systemPromptHint'), h('textarea', {
              className: 'dshcs-textarea',
              value: draft.systemPrompt,
              placeholder: t('systemPromptPlaceholder'),
              spellCheck: false,
              onChange: edit('systemPrompt'),
            })),
            field('context', t('contextLimit'), t('contextLimitHint'), h('input', {
              className: 'dshcs-input',
              type: 'number',
              min: 0,
              max: 500,
              step: 1,
              value: draft.contextLimit,
              onChange: edit('contextLimit'),
            })),
            h('div', { className: 'dshcs-cols', key: 'sampling' }, [
              field('temperature', t('temperature'), t('temperatureHint'), h('input', {
                className: 'dshcs-input',
                type: 'number',
                min: 0,
                max: 2,
                step: 0.1,
                value: draft.temperature,
                onChange: edit('temperature'),
              })),
              field('maxTokens', t('maxTokens'), t('maxTokensHint'), h('input', {
                className: 'dshcs-input',
                type: 'number',
                min: 1,
                step: 1,
                value: draft.maxTokens,
                onChange: edit('maxTokens'),
              })),
            ]),
            h('label', { className: 'dshcs-check', key: 'pureChat' }, [
              h('input', {
                key: 'box',
                type: 'checkbox',
                checked: draft.pureChat,
                onChange: (event) => {
                  const value = event.target.checked
                  setDraft((current) => ({ ...(current || toDraft({})), pureChat: value }))
                  setNotice(false)
                  setError(null)
                },
              }),
              h('span', { key: 'body', className: 'dshcs-ws-body' }, [
                h('span', { key: 'label', className: 'dshcs-ws-name' }, t('pureChat')),
                h('span', { key: 'hint', className: 'dshcs-ws-path' }, t('pureChatHint')),
              ]),
            ]),
          ])
          : null,

        error && status === 'ready'
          ? h('div', { className: 'dshcs-error', key: 'error' }, error)
          : null,
        notice
          ? h('div', { className: 'dshcs-notice', key: 'notice' }, t('saved'))
          : null,

        h('div', { className: 'dshcs-actions', key: 'actions' }, [
          h('button', {
            key: 'reset',
            type: 'button',
            className: 'dshcs-btn ghost',
            disabled: status !== 'ready',
            onClick: reset,
          }, t('reset')),
          h('button', {
            key: 'cancel',
            type: 'button',
            className: 'dshcs-btn',
            onClick: onClose,
          }, t('cancel')),
          h('button', {
            key: 'save',
            type: 'button',
            className: 'dshcs-btn primary',
            disabled: status !== 'ready' || saving,
            onClick: save,
          }, saving ? t('saving') : t('save')),
        ]),
      ]))
    }

    function DialogHost(props) {
      const snapshot = useDialogStore()
      if (!snapshot.open || !snapshot.sessionId) return null
      return h(SettingsDialog, {
        t: props.t,
        sessionId: snapshot.sessionId,
        onClose: () => dialogStore.close(),
        onSaved: () => dialogStore.touch(),
      })
    }

    function ChatSettingsButton(props) {
      const { t, sessionId } = props
      const snapshot = useDialogStore()
      const [enabled, setEnabled] = useState(null)
      const [configured, setConfigured] = useState(false)

      useEffect(() => {
        let alive = true
        setEnabled(null)
        requestJson(`${SETTINGS_PATH}?sessionId=${encodeURIComponent(sessionId)}`)
          .then((payload) => {
            if (!alive) return
            setEnabled(payload.enabled === true)
            setConfigured(payload.configured === true)
          })
          .catch(() => {
            if (alive) setEnabled(false)
          })
        return () => {
          alive = false
        }
      }, [sessionId, snapshot.revision])

      if (enabled !== true) return null

      const hero = props.variant === 'hero'

      return h('button', {
        type: 'button',
        className: hero ? 'dshcs-hero' : 'dshcs-head',
        title: configured ? `${t('open')} · ${t('configured')}` : t('open'),
        'aria-label': t('open'),
        onClick: () => dialogStore.open(sessionId),
      }, [
        icon({
          size: hero ? 15 : 14,
          children: [
            h('path', { key: 'a', d: 'M2.5 3.5h11v9h-11z' }),
            h('path', { key: 'b', d: 'M5 6.5h6M5 9.5h4' }),
          ],
        }),
        h('span', { key: 'label' }, t('open')),
        configured ? h('span', { key: 'dot', className: 'dshcs-dot' }) : null,
      ])
    }

    /** Hero variant of the header action, styled like the workspace/preset pills. */
    function ChatSettingsHeroButton(props) {
      return h(ChatSettingsButton, { ...props, variant: 'hero' })
    }

    /** Settings page: Workspace check list plus the empty-chat-workspace action. */
    function ChatSettingsSection(props) {
      const { t, close } = props
      const [workspaces, setWorkspaces] = useState(null)
      const [error, setError] = useState(null)
      const [busy, setBusy] = useState('')
      const [opening, setOpening] = useState(false)

      useEffect(() => {
        let alive = true
        requestJson(WORKSPACES_PATH)
          .then((payload) => {
            if (alive) setWorkspaces(Array.isArray(payload.workspaces) ? payload.workspaces : [])
          })
          .catch((reason) => {
            if (!alive) return
            setWorkspaces([])
            setError(reason instanceof Error ? reason.message : String(reason))
          })
        return () => {
          alive = false
        }
      }, [])

      const all = workspaces || []

      const toggle = async (workspace, enabled) => {
        if (busy !== '') return
        setBusy(workspace.path)
        setError(null)
        try {
          await requestJson(WORKSPACES_PATH, {
            method: 'POST',
            body: JSON.stringify({ path: workspace.path, enabled }),
          })
          setWorkspaces((list) => (list || []).map((entry) => (
            entry.path === workspace.path ? { ...entry, enabled } : entry
          )))
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          setBusy('')
        }
      }

      const setAllEnabled = async (enabled) => {
        if (busy !== '' || all.length === 0) return
        setBusy('*')
        setError(null)
        try {
          for (const workspace of all) {
            if ((workspace.enabled === true) === enabled) continue
            await requestJson(WORKSPACES_PATH, {
              method: 'POST',
              body: JSON.stringify({ path: workspace.path, enabled }),
            })
          }
          setWorkspaces((list) => (list || []).map((entry) => ({ ...entry, enabled })))
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          setBusy('')
        }
      }

      const openChatSpace = async () => {
        if (opening) return
        setOpening(true)
        setError(null)
        try {
          const result = await props.openChatWorkspace()
          if (!result || result.ok !== true) {
            setError(`${t('workspaceFailed')} ${result && result.error ? result.error : ''}`.trim())
          } else if (typeof close === 'function') {
            close()
          }
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
        } finally {
          setOpening(false)
        }
      }

      return h('div', { className: 'dshcs-section' }, [
        h('div', { className: 'dshcs-title', key: 'title' }, t('sectionTitle')),
        h('div', { className: 'dshcs-subtitle dshcs-section-hint', key: 'hint' }, t('sectionHint')),

        h('div', { className: 'dshcs-ws-head', key: 'head' }, [
          h('div', { className: 'dshcs-label', key: 'label' }, t('workspacesTitle')),
          h('div', { className: 'dshcs-ws-group', key: 'group' }, [
            h('button', {
              key: 'all',
              type: 'button',
              className: 'dshcs-btn',
              disabled: all.length === 0 || busy !== '',
              onClick: () => setAllEnabled(true),
            }, t('checkAll')),
            h('button', {
              key: 'none',
              type: 'button',
              className: 'dshcs-btn',
              disabled: all.length === 0 || busy !== '',
              onClick: () => setAllEnabled(false),
            }, t('uncheckAll')),
          ]),
        ]),

        workspaces === null
          ? h('div', { className: 'dshcs-hint', key: 'loading' }, t('loading'))
          : all.length === 0
            ? h('div', { className: 'dshcs-hint', key: 'empty' }, t('noWorkspaces'))
            : h('div', { key: 'list' }, all.map((workspace) => h('label', {
              key: workspace.id,
              className: 'dshcs-ws',
            }, [
              h('input', {
                key: 'check',
                type: 'checkbox',
                checked: workspace.enabled === true,
                disabled: busy !== '',
                onChange: (event) => toggle(workspace, event.target.checked),
              }),
              h('span', { key: 'body', className: 'dshcs-ws-body' }, [
                h('span', { key: 'name', className: 'dshcs-ws-name' }, workspace.title || workspace.path),
                h('span', { key: 'path', className: 'dshcs-ws-path' }, workspace.path),
              ]),
            ]))),

        error ? h('div', { className: 'dshcs-error', key: 'error' }, error) : null,

        h('div', { className: 'dshcs-actions', key: 'actions' }, [
          h('button', {
            key: 'open',
            type: 'button',
            className: 'dshcs-btn primary',
            disabled: opening,
            onClick: openChatSpace,
          }, opening ? t('workspaceBusy') : t('workspace')),
          h('button', {
            key: 'close',
            type: 'button',
            className: 'dshcs-btn',
            onClick: () => {
              if (typeof close === 'function') close()
            },
          }, t('close')),
        ]),
      ])
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'chat-settings: locale')

        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.plugin = '@fallnstrelitzia/dsh-chat-settings'
          style.textContent = CSS
          document.head.appendChild(style)
          return () => {
            style.remove()
          }
        }, 'chat-settings: styles')

        const face = {
          openChatWorkspace: async () => {
            const workspaces = ctx.get('workspaces')
            const uiWorkspace = ctx.get('uiWorkspace')
            if (!workspaces || !uiWorkspace) {
              return { ok: false, error: 'workspace services are unavailable' }
            }
            try {
              const payload = await requestJson(WORKSPACE_PATH, { method: 'POST', body: '{}' })
              const view = await workspaces.create({ path: payload.path })
              uiWorkspace.startSession(view.workspaceId)
              return { ok: true }
            } catch (reason) {
              return { ok: false, error: reason instanceof Error ? reason.message : String(reason) }
            }
          },
        }

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'chat-settings-dialog',
          order: 90,
          locale: NS,
        }, DialogHost))

        ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions',
          id: 'chat-settings',
          order: 6,
          locale: NS,
        }, ChatSettingsButton))

        // A fresh Session shows the Hero instead of the Session header, so the
        // same action also sits in the New Session row and can be configured
        // before the first message.
        ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({
          name: 'conversation.hero.options',
          id: 'chat-settings-hero',
          order: 20,
          locale: NS,
        }, ChatSettingsHeroButton))

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'chat-settings',
          order: 55,
          label: '对话设置 / Chat settings',
          locale: NS,
          inject: () => face,
        }, ChatSettingsSection))
      },
    }
  },
})
