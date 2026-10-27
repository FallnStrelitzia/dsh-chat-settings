/**
 * @local/dsh-chat-settings — Host half.
 *
 * Owns per-Session chat settings (a system-prompt addendum, a context-window
 * size measured in conversation turns, and optional sampling overrides) plus a
 * dedicated empty "Chat" workspace the Web UI can create on demand.
 *
 * Settings are stored in one JSON document under $DSH_HOME. They are applied at
 * request time: the prompt addendum through a per-Agent `systemPrompt` section,
 * the sampling overrides through the `agent/request` waterfall, and the context
 * window by folding older surface turns into one developer notice (the same
 * surface-replacement mechanism Session compaction uses, so the request remains
 * a pure function of the log).
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

const PLUGIN = 'chat-settings'
const SETTINGS_ROUTE = '/api/chat-settings'
const WORKSPACE_ROUTE = '/api/chat-settings/workspace'
const WORKSPACES_ROUTE = '/api/chat-settings/workspaces'
const PROMPT_SECTION = 'chat-settings:conversation-instructions'
const PLACEHOLDER_PREFIX = 'chat-settings-fold-'
const MAX_PROMPT_CHARS = 20_000
const MAX_CONTEXT_LIMIT = 500
const MAX_OUTPUT_TOKENS = 262_144
// Near the end of the assembled system prompt: later sections weigh more on the
// model than earlier ones, and this text is supposed to win over defaults.
const PROMPT_ORDER = 900
// Pure chat is assembled at request time. The old preset identity survives only
// so the one-time repair can find Sessions written by older versions.
const LEGACY_PURE_CHAT_PRESET = 'chat-settings-pure-chat'
const STATE_VERSION = 3
const STRIPPED_SOURCE_KINDS = new Set(['agent-instructions', 'time-context'])

const DEFAULT_SETTINGS = Object.freeze({
  systemPrompt: '',
  contextLimit: 0,
  temperature: null,
  maxTokens: null,
  pureChat: false,
})

export const inject = ['agents', 'sessions']

let placeholderCounter = 0

function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv
  return path.join(os.homedir(), '.dsh')
}

function stateFile() {
  return path.join(dshHome(), 'chat-settings', 'settings.json')
}

function emptyState() {
  return { version: STATE_VERSION, sessions: {}, workspaces: {}, chatWorkspacePath: undefined }
}

/** One stable key for a workspace directory across separator and case noise. */
function workspaceKey(value) {
  if (typeof value !== 'string' || value.trim() === '') return ''
  return value.trim().replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase()
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/** Normalize one settings document into the fields this plugin owns. */
function normalizeSettings(input, base = DEFAULT_SETTINGS) {
  const next = {
    systemPrompt: base.systemPrompt,
    contextLimit: base.contextLimit,
    temperature: base.temperature,
    maxTokens: base.maxTokens,
    pureChat: base.pureChat === true,
  }
  if (!isPlainObject(input)) return next
  if (typeof input.systemPrompt === 'string') {
    next.systemPrompt = input.systemPrompt.slice(0, MAX_PROMPT_CHARS)
  }
  if (input.contextLimit === null) {
    next.contextLimit = 0
  } else if (Number.isFinite(input.contextLimit)) {
    next.contextLimit = clamp(Math.round(input.contextLimit), 0, MAX_CONTEXT_LIMIT)
  }
  if (input.temperature === null) {
    next.temperature = null
  } else if (Number.isFinite(input.temperature)) {
    next.temperature = clamp(Math.round(input.temperature * 100) / 100, 0, 2)
  }
  if (input.maxTokens === null) {
    next.maxTokens = null
  } else if (Number.isFinite(input.maxTokens)) {
    next.maxTokens = clamp(Math.round(input.maxTokens), 1, MAX_OUTPUT_TOKENS)
  }
  if (typeof input.pureChat === 'boolean') next.pureChat = input.pureChat
  return next
}

function isDefaultSettings(settings) {
  return (
    settings.systemPrompt.trim() === ''
    && settings.contextLimit === 0
    && settings.temperature === null
    && settings.maxTokens === null
    && settings.pureChat !== true
  )
}

function loadState() {
  const file = stateFile()
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    const state = emptyState()
    // A document written before the runtime pure-chat change carries version 2
    // and still needs the one-time Session repair.
    state.version = Number.isInteger(parsed?.version) ? parsed.version : 2
    if (isPlainObject(parsed?.sessions)) {
      for (const [sessionId, value] of Object.entries(parsed.sessions)) {
        if (typeof sessionId === 'string' && isPlainObject(value)) {
          state.sessions[sessionId] = normalizeSettings(value)
        }
      }
    }
    if (isPlainObject(parsed?.workspaces)) {
      for (const [directory, enabled] of Object.entries(parsed.workspaces)) {
        const key = workspaceKey(directory)
        if (key !== '' && enabled === true) state.workspaces[key] = true
      }
    }
    if (typeof parsed?.chatWorkspacePath === 'string') state.chatWorkspacePath = parsed.chatWorkspacePath
    return state
  } catch {
    return emptyState()
  }
}

function persistState(state) {
  const file = stateFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  fs.renameSync(temporary, file)
}

function writeJson(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

/** Host-side owner of the per-Session settings document. */
class ChatSettingsStore {
  constructor(logger) {
    this.logger = logger
    this.state = loadState()
  }

  settingsFor(sessionId) {
    const stored = this.state.sessions[String(sessionId)]
    return stored === undefined ? { ...DEFAULT_SETTINGS } : { ...stored }
  }

  isConfigured(sessionId) {
    return !isDefaultSettings(this.settingsFor(sessionId))
  }

  save(sessionId, patch) {
    const key = String(sessionId)
    const next = normalizeSettings(patch, this.settingsFor(key))
    if (isDefaultSettings(next)) {
      delete this.state.sessions[key]
    } else {
      this.state.sessions[key] = next
    }
    persistState(this.state)
    return next
  }

  clear(sessionId) {
    const key = String(sessionId)
    delete this.state.sessions[key]
    persistState(this.state)
    return { ...DEFAULT_SETTINGS }
  }

  isWorkspaceEnabled(directory) {
    const key = workspaceKey(directory)
    return key !== '' && this.state.workspaces[key] === true
  }

  setWorkspaceEnabled(directory, enabled) {
    const key = workspaceKey(directory)
    if (key === '') return false
    if (enabled) this.state.workspaces[key] = true
    else delete this.state.workspaces[key]
    persistState(this.state)
    return this.state.workspaces[key] === true
  }

  enabledDirectories() {
    return Object.keys(this.state.workspaces)
  }

  ensureChatWorkspace() {
    const directory = path.join(dshHome(), 'chat-workspaces', 'chat')
    fs.mkdirSync(directory, { recursive: true })
    const key = workspaceKey(directory)
    if (this.state.chatWorkspacePath !== directory || this.state.workspaces[key] !== true) {
      this.state.chatWorkspacePath = directory
      this.state.workspaces[key] = true
      persistState(this.state)
    }
    return directory
  }

  warn(message) {
    try {
      this.logger?.warn?.(`${PLUGIN}: ${message}`)
    } catch {
      // Logging must never break a turn.
    }
  }
}

/** Turn one stored setting into the text appended to the system prompt. */
function promptAddendum(settings) {
  const text = settings.systemPrompt.trim()
  if (text === '') return ''
  return [
    '## Conversation instructions · 对话级指令',
    '',
    text,
    '',
    'These instructions belong to this conversation only and take precedence over generic style defaults where they disagree; they yield only to non-negotiable safety rules and tool contracts.',
    '以上指令只属于当前对话，与默认风格冲突时以这里为准；仅在安全规则或工具契约前让位。',
  ].join('\n')
}

/**
 * Fold older turns out of the model-visible surface once a Session exceeds its
 * configured turn budget. The replacement keeps the latest system prompt and
 * covers whole surface nodes, so the request stays a pure function of the log.
 */
function foldContextWindow(store, session, turn, step) {
  const settings = store.settingsFor(session.id)
  const limit = settings.contextLimit
  if (!Number.isInteger(limit) || limit <= 0) return

  const nodes = session.surface.nodes
  if (!Array.isArray(nodes) || nodes.length === 0) return

  const eventAt = (seq) => session.eventAt(seq)
  const userSeqs = []
  for (const seq of nodes) {
    if (eventAt(seq)?.type === 'user/message') userSeqs.push(seq)
  }
  if (userSeqs.length <= limit) return

  const keepSeq = userSeqs[userSeqs.length - limit]
  const cutIndex = nodes.indexOf(keepSeq)
  if (cutIndex <= 0) return

  let startIndex = 0
  for (let index = cutIndex - 1; index >= 0; index -= 1) {
    if (eventAt(nodes[index])?.type === 'system/message') {
      startIndex = index + 1
      break
    }
  }
  if (startIndex >= cutIndex) return

  const startSeq = nodes[startIndex]
  const endSeq = nodes[cutIndex - 1]
  if (eventAt(startSeq)?.type === 'system/message') return

  const omitted = userSeqs.length - limit
  placeholderCounter = (placeholderCounter + 1) % 1_679_616
  const message = {
    id: `${PLACEHOLDER_PREFIX}${Date.now().toString(36)}-${placeholderCounter.toString(36)}`,
    role: 'developer',
    content: [{
      type: 'text',
      text: `〔对话设置〕为控制上下文长度，已折叠此前的 ${omitted} 轮对话，仅保留最近 ${limit} 轮。`,
    }],
    source: { kind: 'user' },
  }
  session.append('developer/message', { turn, step, message }, {
    surfaceOp: { op: 'replace', startSeq, endSeq },
    sourceEventSeqs: nodes.slice(startIndex, cutIndex),
  })
}

/** Plain text of one logged message, for comparing an injected instructions row. */
function messageText(message) {
  if (!isPlainObject(message) || !Array.isArray(message.content)) return ''
  return message.content
    .filter((part) => isPlainObject(part) && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
}

const INSTRUCTIONS_MARKER = '## Conversation instructions'

/**
 * Fallback for presets that do not mount the `systemPrompt` service (minimal
 * mode builds its prompt through `dsh-persona`): the instructions travel as a
 * logged user message placed after the user's own batch, because that is the
 * only channel the wire adapter is guaranteed to forward.
 *
 * The event payload is the message itself (that is the shape `user/message`
 * carries); wrapping it in `{ turn, step, message }` corrupts the projection.
 */
function ensurePromptMessage(store, session, turn, step) {
  const text = promptAddendum(store.settingsFor(session.id))
  const nodes = session.surface.nodes
  if (!Array.isArray(nodes)) return

  // The surface must already start from a protected system head before another
  // user message can join it; appending one first corrupts the step's log.
  const hasSystemHead = nodes.some((seq) => session.eventAt(seq)?.type === 'system/message')
  if (!hasSystemHead) return

  let existingSeq = -1
  let existingText = ''
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const event = session.eventAt(nodes[index])
    if (event?.type !== 'user/message') continue
    const current = messageText(event.data)
    if (current.startsWith(INSTRUCTIONS_MARKER)) {
      existingSeq = nodes[index]
      existingText = current
      break
    }
  }

  if (existingText === text) return

  placeholderCounter = (placeholderCounter + 1) % 1_679_616
  const message = {
    id: `${PLACEHOLDER_PREFIX}instructions-${Date.now().toString(36)}-${placeholderCounter.toString(36)}`,
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user', rpcId: `${PLACEHOLDER_PREFIX}rpc-${Date.now().toString(36)}` },
  }
  if (existingSeq === -1) {
    if (text === '') return
    session.append('user/message', message, { surfaceOp: 'append' })
    return
  }
  session.append('user/message', message, {
    surfaceOp: { op: 'replace', startSeq: existingSeq, endSeq: existingSeq },
    sourceEventSeqs: [existingSeq],
  })
}

export function apply(ctx) {
  const store = new ChatSettingsStore(ctx.logger)
  const promptFibers = new Map()

  /** The directory a Session runs in, used to match its Workspace row. */
  const sessionDirectory = (session) => {
    try {
      const resolved = ctx.get('workingDirectory')?.get?.(session)
      if (typeof resolved === 'string' && resolved.trim() !== '') return resolved
      if (resolved && typeof resolved.path === 'string' && resolved.path !== '') return resolved.path
    } catch {
      // Fall through to the logged Session header.
    }
    const candidates = [
      session?.header?.cwd,
      session?.cwd,
      session?.info?.cwd,
      session?.snapshot?.header?.cwd,
    ]
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim() !== '') return value
    }
    return ''
  }

  /** Only Sessions inside a checked Workspace see this plugin's effects. */
  const sessionEnabled = (sessionId) => {
    const session = ctx.sessions.get(String(sessionId))
    if (session === undefined) return false
    return store.isWorkspaceEnabled(sessionDirectory(session))
  }

  /** Agents whose context actually mounted the `systemPrompt` service. */
  const promptReady = new WeakSet()

  const installPrompt = (agent) => {
    const existing = promptFibers.get(agent)
    if (existing !== undefined) return existing
    const fiber = agent.ctx.inject(['systemPrompt'], (scope) => {
      promptReady.add(agent)
      scope.effect(
        () => scope.systemPrompt.section({
          name: PROMPT_SECTION,
          order: PROMPT_ORDER,
          text: () => (sessionEnabled(agent.id) ? promptAddendum(store.settingsFor(agent.id)) : ''),
        }),
        `${PLUGIN}: prompt section`,
      )
    })
    promptFibers.set(agent, fiber)
    return fiber
  }

  const disposePrompt = (agent) => {
    const fiber = promptFibers.get(agent)
    if (fiber === undefined) return
    promptFibers.delete(agent)
    Promise.resolve(fiber.dispose?.()).catch((error) => {
      store.warn(`prompt cleanup failed: ${errorMessage(error)}`)
    })
  }

  const pureChatEnabled = (sessionId) => store.settingsFor(sessionId).pureChat === true

  /**
   * Pure chat is assembled here instead of through a preset: keep this
   * conversation's instructions, drop every other prompt section, and carry no
   * tool schemas at all. A normal request after leaving pure chat carries the
   * full tool list again, which rebuilds the ledger baseline.
   */
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const downstream = await next()
    try {
      if (downstream === null || typeof downstream !== 'object') return downstream
      const agent = context?.agent
      const sessionId = agent?.id
      if (typeof sessionId !== 'string' || !pureChatEnabled(sessionId)) return downstream
      const text = promptAddendum(store.settingsFor(sessionId))
      const own = Array.isArray(downstream?.sections)
        ? downstream.sections.find((section) => section?.name === PROMPT_SECTION)
        : undefined
      const sections = text === ''
        ? []
        : [own !== undefined ? { ...own } : { name: PROMPT_SECTION, order: PROMPT_ORDER, text }]
      return { ...downstream, sections, contexts: [], tools: [] }
    } catch {
      return downstream
    }
  })

  /**
   * Append a final `standard` selection to one Session written by an older
   * version. The projection replays `agent-preset/selected` events, so rewriting
   * the header alone never moved a cold Session off the dead preset identity.
   */
  const repairLegacySession = (file) => {
    const buffer = fs.readFileSync(file)
    const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
    const starts = []
    let cursor = 0
    while ((cursor = buffer.indexOf(magic, cursor)) !== -1) {
      starts.push(cursor)
      cursor += 4
    }
    if (starts.length === 0) return false
    const lines = []
    for (let index = 0; index < starts.length; index += 1) {
      const start = starts[index]
      const end = index + 1 < starts.length ? starts[index + 1] : buffer.length
      try {
        lines.push(zlib.zstdDecompressSync(buffer.subarray(start, end)).toString('utf8'))
      } catch {
        // Ignore a partially written tail frame, same as the Session reader.
      }
    }
    const rows = []
    for (const line of lines.join('').split('\n')) {
      if (line.trim() === '') continue
      try {
        rows.push(JSON.parse(line))
      } catch {
        // A malformed row means the log is mid-write; leave it for the next run.
        return false
      }
    }
    if (rows.length === 0) return false
    const header = rows[0]
    let selected = null
    for (const row of rows) {
      if (row?.type === 'agent-preset/selected') selected = row?.data?.agentPreset ?? null
    }
    if (selected !== LEGACY_PURE_CHAT_PRESET && header?.agentPreset !== LEGACY_PURE_CHAT_PRESET) return false
    const last = rows[rows.length - 1]
    if (!Number.isInteger(last?.seq)) return false
    const event = {
      type: 'agent-preset/selected',
      seq: last.seq + 1,
      time: Date.now(),
      data: { agentPreset: 'standard' },
    }
    fs.appendFileSync(file, zlib.zstdCompressSync(Buffer.from(`${JSON.stringify(event)}\n`, 'utf8')))
    return true
  }

  /**
   * Older versions switched pure-chat Sessions to a preset and recorded that
   * choice as an `agent-preset/selected` event. Now that the preset is gone,
   * append a final `standard` selection so the projection no longer resolves the
   * dead identity. Runs once per profile; live Sessions are left alone because
   * their log is still being written.
   */
  const repairLegacySessions = () => {
    if (store.state.version >= STATE_VERSION) return
    const root = path.join(dshHome(), 'sessions')
    let repaired = 0
    let scanned = 0
    let skipped = 0
    try {
      for (const workspace of fs.readdirSync(root)) {
        const workspaceDir = path.join(root, workspace)
        let entries
        try {
          entries = fs.readdirSync(workspaceDir, { withFileTypes: true })
        } catch {
          continue
        }
        for (const entry of entries) {
          if (!entry.isDirectory() || !entry.name.startsWith('session-')) continue
          if (ctx.agents.get(entry.name) !== undefined) {
            skipped += 1
            continue
          }
          const dir = path.join(workspaceDir, entry.name)
          let file
          try {
            file = fs.readdirSync(dir).find((name) => name.endsWith('.zstd'))
          } catch {
            skipped += 1
            continue
          }
          if (file === undefined) continue
          scanned += 1
          try {
            if (repairLegacySession(path.join(dir, file))) repaired += 1
          } catch {
            // Leave an unreadable Session for the next run.
            skipped += 1
          }
        }
      }
    } catch {
      return
    }
    if (skipped === 0) {
      store.state.version = STATE_VERSION
      persistState(store.state)
    }
    if (repaired > 0) store.warn(`repaired ${repaired}/${scanned} legacy pure-chat Sessions`)
    if (skipped > 0) store.warn(`legacy pure-chat repair deferred for ${skipped} Sessions; retrying next start`)
  }

  const requestHooks = new Map()
  const diagnosed = new Set()

  /**
   * Request hook lives in the Agent's own scope: a profile-level listener never
   * fires for Agents composed by a preset that isolates its event routing.
   */
  const handleRequest = async (payload, next) => {
    let enabled = false
    try {
      // A Session the user configured explicitly always applies; the Workspace
      // check only decides whether the unconfigured default is on.
      enabled = !isDefaultSettings(store.settingsFor(payload.agent.id))
        || sessionEnabled(payload.agent.id)
      // Fold before the request is assembled: the replacement only affects
      // assemblies that happen after it, so folding after `next()` would lag
      // one step behind and the model would still see the removed turn.
      // Prefer the Agent's own context: a plugin context can go inactive when
      // the same plugin is hot-mounted twice.
      let session
      try {
        session = payload.agent.ctx.get?.('sessions')?.get?.(payload.agent.id)
      } catch {
        session = undefined
      }
      if (session === undefined) {
        try {
          session = ctx.sessions.get(payload.agent.id)
        } catch {
          session = undefined
        }
      }
      if (enabled && session !== undefined) {
        foldContextWindow(store, session, payload.turn, payload.step)
        // Agents that mount `systemPrompt` render the instructions there; the
        // rest fall back to a logged user message.
        let viaSystemPrompt = promptReady.has(payload.agent)
        if (!viaSystemPrompt) {
          try {
            viaSystemPrompt = payload.agent.ctx.get('systemPrompt') !== undefined
          } catch {
            viaSystemPrompt = false
          }
        }
        if (!viaSystemPrompt) {
          ensurePromptMessage(store, session, payload.turn, payload.step)
        }
      } else if (!diagnosed.has(payload.agent.id)) {
        diagnosed.add(payload.agent.id)
        store.warn(`request ${payload.agent.id}: enabled=${enabled} session=${session === undefined ? 'missing' : 'ok'} dir="${session === undefined ? '' : sessionDirectory(session)}"`)
      }
    } catch (error) {
      store.warn(`context fold failed: ${errorMessage(error)}`)
    }

    const base = await next()

    try {
      if (!enabled) return base
      const settings = store.settingsFor(payload.agent.id)
      const overrides = {}
      if (typeof settings.temperature === 'number') overrides.temperature = settings.temperature
      if (typeof settings.maxTokens === 'number') overrides.maxTokens = settings.maxTokens
      if (Object.keys(overrides).length === 0) return base
      return { ...base, ...overrides }
    } catch (error) {
      store.warn(`request override failed: ${errorMessage(error)}`)
      return base
    }
  }

  const installRequestHook = (agent) => {
    if (requestHooks.has(agent)) return
    const fiber = agent.ctx.effect(
      () => agent.ctx.on('agent/request', handleRequest),
      `${PLUGIN}: request hook`,
    )
    requestHooks.set(agent, fiber)
  }

  const disposeRequestHook = (agent) => {
    const fiber = requestHooks.get(agent)
    if (fiber === undefined) return
    requestHooks.delete(agent)
    Promise.resolve(fiber?.dispose?.()).catch(() => {})
  }

  /**
   * A preset switch recomposes the Agent's context, dropping hooks installed on
   * the previous one. Re-install against the context the Agent now carries.
   */
  const refreshRequestHook = (agent) => {
    disposeRequestHook(agent)
    installRequestHook(agent)
  }

  /**
   * Runtime-context contributions are assembled by `systemPrompt` after
   * `agent/pre-step`, so filtering pre-step messages cannot remove them. Hold
   * scoped suppressors while pure chat is on and release them when the switch
   * goes back off. `working-directory:current` is a required context that the
   * generic suppressor keeps, so shadow it with an empty same-name provider.
   */
  const runtimeSuppressors = new WeakMap()

  const releasePureChatSuppressor = (agent) => {
    const held = runtimeSuppressors.get(agent)
    if (held === undefined) return
    runtimeSuppressors.delete(agent)
    for (const disposer of held) {
      try {
        disposer()
      } catch {
        // Disposal is best effort.
      }
    }
  }

  const syncPureChatSuppressor = (agent) => {
    if (agent === null || typeof agent !== 'object') return
    if (!pureChatEnabled(agent.id)) {
      releasePureChatSuppressor(agent)
      return
    }
    if (runtimeSuppressors.has(agent)) return
    const disposers = []
    try {
      const systemPrompt = agent.ctx.get('systemPrompt')
      if (typeof systemPrompt?.suppressRuntimeContext === 'function') {
        const disposer = systemPrompt.suppressRuntimeContext()
        if (typeof disposer === 'function') disposers.push(disposer)
      }
      if (typeof systemPrompt?.context === 'function') {
        const order = typeof systemPrompt.getContextOrder === 'function'
          ? systemPrompt.getContextOrder('WORKING_DIRECTORY')
          : 0
        const disposer = systemPrompt.context({
          name: 'working-directory:current',
          order,
          required: false,
          interpolate: false,
          text: () => '',
        })
        if (typeof disposer === 'function') disposers.push(disposer)
      }
      if (disposers.length === 0) return
      runtimeSuppressors.set(agent, disposers)
    } catch (error) {
      for (const disposer of disposers) {
        try {
          disposer()
        } catch {
          // Roll back what was installed before the failure.
        }
      }
      store.warn(`pure-chat runtime suppression failed: ${errorMessage(error)}`)
    }
  }

  /**
   * Runtime and time context are appended by other `agent/pre-step` listeners.
   * Register in the Agent's own scope with `prepend` so this listener runs before
   * them and sees their additions on the way back out.
   */
  const preStepFibers = new WeakMap()

  const installPreStep = (agent) => {
    if (preStepFibers.has(agent)) return
    try {
      const fiber = agent.ctx.effect(
        () => agent.ctx.on('agent/pre-step', async ({ agent: current }, next) => {
          const decision = await next()
          try {
            if (decision === null || typeof decision !== 'object') return decision
            if (decision.kind === 'reject' || !Array.isArray(decision.messages)) return decision
            const sessionId = current?.id
            if (typeof sessionId !== 'string' || !pureChatEnabled(sessionId)) return decision
            const messages = decision.messages.filter((message) => {
              const source = message?.source
              if (source === null || typeof source !== 'object') return true
              if (source.kind === 'runtime-context' && source.form === 'snapshot') return false
              if (source.kind === 'skill-catalog' && source.form === 'catalog') return false
              return !STRIPPED_SOURCE_KINDS.has(source.kind)
            })
            if (messages.length === decision.messages.length) return decision
            return { ...decision, messages }
          } catch {
            return decision
          }
        }, { prepend: true }),
        `${PLUGIN}: pure-chat pre-step`,
      )
      preStepFibers.set(agent, fiber)
    } catch (error) {
      store.warn(`pure-chat pre-step hook failed: ${errorMessage(error)}`)
    }
  }

  const disposePreStep = (agent) => {
    const fiber = preStepFibers.get(agent)
    if (fiber === undefined) return
    preStepFibers.delete(agent)
    Promise.resolve(fiber?.dispose?.()).catch(() => {})
  }

  const installAgent = (agent) => {
    try {
      installPrompt(agent)
      installRequestHook(agent)
      installPreStep(agent)
      syncPureChatSuppressor(agent)
    } catch (error) {
      // Never let this plugin's bookkeeping abort an Agent creation.
      store.warn(`install failed for ${agent?.id}: ${errorMessage(error)}`)
    }
  }

  for (const agent of ctx.agents.list()) installAgent(agent)

  ctx.on('agent/created', ({ agent }) => {
    installAgent(agent)
    // The preset may finish composing a tick after creation; keep a fresh hook.
    try {
      ctx.setTimeout?.(() => {
        try {
          if (ctx.agents.get(agent.id) === agent) {
            refreshRequestHook(agent)
            installPreStep(agent)
            syncPureChatSuppressor(agent)
          }
        } catch {
          // Best effort.
        }
      }, 120)
    } catch {
      // Timer service unavailable: the immediate hook above still applies.
    }
  })

  ctx.on('agent/disposed', ({ agent }) => {
    disposePrompt(agent)
    disposeRequestHook(agent)
    disposePreStep(agent)
    releasePureChatSuppressor(agent)
  })

  ctx.effect(() => () => {
    const fibers = [...promptFibers.values()]
    promptFibers.clear()
    for (const fiber of fibers) {
      Promise.resolve(fiber.dispose?.()).catch((error) => {
        store.warn(`prompt cleanup failed: ${errorMessage(error)}`)
      })
    }
    for (const agent of [...requestHooks.keys()]) disposeRequestHook(agent)
  }, `${PLUGIN}: prompt cleanup`)

  // One-time repair for Sessions written by the preset-based version. It only
  // appends an event, never rewrites an existing log, and is idempotent.
  try {
    repairLegacySessions()
  } catch (error) {
    store.warn(`legacy Session repair failed: ${errorMessage(error)}`)
  }

  /**
   * The same plugin can be mounted twice (bundle row plus a market hot tree),
   * and a duplicate exact route throws. Keep the first registration per path.
   */
  const registerRoute = (scope, spec, label) => {
    scope.effect(() => {
      try {
        return scope.connection.fetch.register(spec)
      } catch (error) {
        store.warn(`${label} skipped: ${errorMessage(error)}`)
        return () => {}
      }
    }, `${PLUGIN}: ${label}`)
  }

  ctx.inject(['connection'], (scope) => {
    registerRoute(scope, {
      path: SETTINGS_ROUTE,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          if (request.method === 'GET') {
            const url = new URL(request.url)
            const sessionId = url.searchParams.get('sessionId') ?? ''
            const settings = store.settingsFor(sessionId)
            return writeJson({
              ok: true,
              settings,
              configured: store.isConfigured(sessionId),
              enabled: !isDefaultSettings(settings) || sessionEnabled(sessionId),
            })
          }
          const body = await request.json().catch(() => ({}))
          const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
          if (sessionId === '') return writeJson({ ok: false, error: 'missing sessionId' }, 400)
          const settings = store.save(sessionId, body?.settings ?? {})
          syncPureChatSuppressor(ctx.agents.get(sessionId))
          return writeJson({ ok: true, settings, configured: !isDefaultSettings(settings) })
        } catch (error) {
          return writeJson({ ok: false, error: errorMessage(error) }, 500)
        }
      },
    }, 'settings route')

    registerRoute(scope, {
      path: WORKSPACE_ROUTE,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: async () => {
        try {
          return writeJson({ ok: true, path: store.ensureChatWorkspace() })
        } catch (error) {
          return writeJson({ ok: false, error: errorMessage(error) }, 500)
        }
      },
    }, 'workspace route')

    registerRoute(scope, {
      path: WORKSPACES_ROUTE,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          if (request.method === 'GET') {
            let list = []
            try {
              list = ctx.get('workspaceRegistry')?.list?.() ?? []
            } catch {
              list = []
            }
            const workspaces = list.map((workspace) => ({
              id: String(workspace.id),
              path: typeof workspace.path === 'string' ? workspace.path : '',
              title: typeof workspace.title === 'string' ? workspace.title : '',
              enabled: store.isWorkspaceEnabled(workspace.path),
            }))
            return writeJson({
              ok: true,
              workspaces,
              chatWorkspacePath: store.state.chatWorkspacePath ?? null,
            })
          }
          const body = await request.json().catch(() => ({}))
          const directory = typeof body?.path === 'string' ? body.path : ''
          if (directory === '') return writeJson({ ok: false, error: 'missing path' }, 400)
          const enabled = store.setWorkspaceEnabled(directory, body?.enabled === true)
          return writeJson({ ok: true, path: directory, enabled })
        } catch (error) {
          return writeJson({ ok: false, error: errorMessage(error) }, 500)
        }
      },
    }, 'workspaces route')
  })
}
