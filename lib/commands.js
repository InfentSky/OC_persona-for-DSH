import {
  MODES,
  cardToMarkdown,
  modeLabel,
  normalizeMode,
  summaryLine,
} from './persona.js'
import { buildPersonaPrompt } from './prompt.js'

const HELP = `# OC Persona

- \`/oc\` — 查看当前角色、模式与存储状态
- \`/oc list\` — 列出角色库
- \`/oc show [角色]\` — 查看角色卡（省略时查看当前角色）
- \`/oc new <名字>\` — 创建一张空白角色卡并进入共创模式
- \`/oc use <角色> [roleplay|assist]\` — 启用角色并选择模式
- \`/oc mode <roleplay|assist|off>\` — 切换当前会话模式
- \`/oc prompt\` — 预览当前注入的系统提示词
- \`/oc delete <角色> confirm\` — 删除角色卡（需要 confirm）

也可以用自然语言直接说「创建一个角色……」「切到扮演模式」「用共创模式帮我修人设」，我会调用对应工具。`

function requireSession(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new Error('该命令需要在会话中运行')
  }
  return sessionId
}

function activeCard(store, sessionId) {
  const assignment = store.getAssignment(sessionId)
  return assignment.personaId === null ? undefined : store.getCard(assignment.personaId)
}

function sceneText(assignment) {
  const entries = [
    ['场景', assignment.scene],
    ['情绪', assignment.mood],
    ['当前目标', assignment.goal],
    ['与用户角色的关系', assignment.relationship],
    ['连续性备注', assignment.notes],
  ].filter(([, value]) => value.length > 0)
  return entries.map(([label, value]) => `- ${label}：${value}`).join('\n')
}

function status(store, sessionId) {
  const assignment = store.getAssignment(sessionId)
  const card = activeCard(store, sessionId)
  const lines = [
    `**OC Persona** · 存储：${store.storageLabel === 'profile' ? '档案库（持久化）' : '内存（重启后丢失）'} · 角色数：${store.count()}`,
  ]
  if (card === undefined) {
    lines.push('当前角色：未启用')
  } else {
    lines.push(`当前角色：**${card.name}**（\`${card.id}\`）`)
    lines.push(`当前模式：${modeLabel(assignment.mode)}（${assignment.mode}）`)
    const scene = sceneText(assignment)
    if (scene.length > 0) lines.push('', '场景状态：', scene)
  }
  lines.push('', '使用 `/oc help` 查看命令。')
  return lines.join('\n')
}

function list(store, sessionId) {
  const cards = store.listCards()
  if (cards.length === 0) return '角色库为空。用 `/oc new <名字>` 新建，或直接描述一个角色让我来建卡。'
  const active = activeCard(store, sessionId)
  const lines = [`共 ${cards.length} 个角色：`]
  for (const card of cards.slice(0, 60)) {
    const marker = active?.id === card.id ? ' **[当前]**' : ''
    lines.push(`- ${summaryLine(card)}${marker}\n  \`${card.id}\``)
  }
  if (cards.length > 60) lines.push(`- ……另有 ${cards.length - 60} 个`)
  return lines.join('\n')
}

function show(store, sessionId, query) {
  const card = query.length > 0 ? store.findCard(query) : activeCard(store, sessionId)
  if (card === undefined) throw new Error(query.length > 0 ? `没有找到角色「${query}」` : '当前没有启用角色，请用 `/oc show <角色>` 指定一个')
  const assignment = store.getAssignment(sessionId)
  const scene = sceneText(assignment)
  return [cardToMarkdown(card), '', '---', `\`${card.id}\` · 版本 ${card.version}`, scene.length > 0 ? `\n场景状态：\n${scene}` : ''].join('\n')
}

function parseUse(tail) {
  const match = tail.match(/^(.*?)\s+(roleplay|assist|off)$/i)
  if (match && match[1].trim().length > 0) {
    return { query: match[1].trim(), mode: match[2].toLowerCase() }
  }
  return { query: tail.trim(), mode: undefined }
}

async function use(store, sessionId, tail, settings) {
  const parsed = parseUse(tail)
  if (parsed.query.length === 0) throw new Error('用法：`/oc use <角色> [roleplay|assist]`')
  const card = store.findCard(parsed.query)
  if (card === undefined) throw new Error(`没有找到角色「${parsed.query}」`)
  const current = store.getAssignment(sessionId)
  const mode = parsed.mode === undefined
    ? (current.personaId === card.id && current.mode !== 'off' ? current.mode : normalizeMode(settings.defaultMode, 'roleplay'))
    : parsed.mode
  if (!MODES.includes(mode)) throw new Error(`模式必须是 ${MODES.join(' / ')}`)
  const switching = current.personaId !== card.id
  await store.setAssignment(sessionId, {
    personaId: card.id,
    mode,
    ...(switching ? { scene: '', mood: '', goal: '', relationship: '', notes: '' } : {}),
  })
  return `已启用 **${card.name}**，模式：${modeLabel(mode)}（${mode}）。`
}

async function mode(store, sessionId, tail) {
  const value = tail.trim().toLowerCase()
  if (value.length === 0) throw new Error(`用法：\`/oc mode <${MODES.join('|')}>\``)
  if (!MODES.includes(value)) throw new Error(`未知模式「${value}」；可选：${MODES.join(' / ')}`)
  const current = store.getAssignment(sessionId)
  if (value !== 'off' && current.personaId === null) {
    throw new Error('当前没有启用角色；请先用 `/oc use <角色>`')
  }
  await store.setAssignment(sessionId, { mode: value })
  return `模式已切换为 ${modeLabel(value)}（${value}）。`
}

async function create(store, sessionId, tail) {
  const name = tail.trim()
  if (name.length === 0) throw new Error('用法：`/oc new <名字>`')
  if (name.length > 120) throw new Error('角色名太长（上限 120 字符）')
  const { card, created } = await store.saveCard({ name })
  const current = store.getAssignment(sessionId)
  await store.setAssignment(sessionId, {
    personaId: card.id,
    mode: 'assist',
    ...(current.personaId !== card.id ? { scene: '', mood: '', goal: '', relationship: '', notes: '' } : {}),
  })
  return created
    ? `已创建 **${card.name}**（\`${card.id}\`），并进入共创模式。\n现在描述这个角色的声音、神态、心理或背景，我会补全人设卡。`
    : `角色 **${card.name}** 已存在，已切换到共创模式。`
}

async function remove(store, tail) {
  const match = tail.match(/^(.*?)\s+confirm$/i)
  if (!match || match[1].trim().length === 0) {
    throw new Error('删除需要确认：`/oc delete <角色> confirm`')
  }
  const card = store.findCard(match[1].trim())
  if (card === undefined) throw new Error(`没有找到角色「${match[1].trim()}」`)
  await store.removeCard(card.id)
  return `已永久删除 **${card.name}**（\`${card.id}\`），相关会话的启用状态也已清除。`
}

function preview(store, sessionId, settings) {
  const assignment = store.getAssignment(sessionId)
  const card = activeCard(store, sessionId)
  const text = buildPersonaPrompt({ card, assignment, settings })
  if (text.length > 16000) return `当前提示词约 ${text.length} 字符，超过预览上限；可通过调小 promptBudget 控制。`
  return ['当前注入的系统提示词：', '', '```text', text, '```'].join('\n')
}

/** Execute one `/oc` invocation. Kept independent of Cordis for direct tests. */
export async function runPersonaCommand(store, sessionId, rawInput, settings = {}) {
  const text = String(rawInput ?? '').trim()
  const space = text.search(/\s/)
  const verb = (space === -1 ? text : text.slice(0, space)).toLowerCase()
  const tail = space === -1 ? '' : text.slice(space).trim()
  try {
    requireSession(sessionId)
    switch (verb) {
      case '':
      case 'status':
        return { kind: 'success', text: status(store, sessionId) }
      case 'help':
      case '?':
        return { kind: 'success', text: HELP }
      case 'list':
      case 'ls':
        return { kind: 'success', text: list(store, sessionId) }
      case 'show':
      case 'read':
        return { kind: 'success', text: show(store, sessionId, tail) }
      case 'new':
      case 'create':
        return { kind: 'success', text: await create(store, sessionId, tail) }
      case 'use':
      case 'activate':
        return { kind: 'success', text: await use(store, sessionId, tail, settings) }
      case 'mode':
        return { kind: 'success', text: await mode(store, sessionId, tail) }
      case 'delete':
      case 'remove':
        return { kind: 'success', text: await remove(store, tail) }
      case 'prompt':
      case 'preview':
        return { kind: 'success', text: preview(store, sessionId, settings) }
      default:
        return { kind: 'error', text: `未知子命令「${verb}」。\n\n${HELP}` }
    }
  } catch (error) {
    return { kind: 'error', text: String(error?.message ?? error) }
  }
}

function definition(name, store, settings) {
  return {
    name,
    description: '管理 OC 角色：查看、创建、启用，并在扮演与共创模式之间切换。',
    input: { hint: 'list | show <角色> | new <名字> | use <角色> [roleplay|assist] | mode <roleplay|assist|off> | prompt' },
    handler: (invocation) => runPersonaCommand(store, invocation.agent?.id, invocation.rawInput, settings),
  }
}

/** Register `/oc`, plus `/persona` as a best-effort alias. */
export function registerPersonaCommands(ctx, store, settings = {}) {
  ctx.effect(() => {
    const disposers = [ctx.commands.register(definition('oc', store, settings))]
    try {
      disposers.push(ctx.commands.register(definition('persona', store, settings)))
    } catch (error) {
      ctx.logger?.debug?.(`oc-persona: /persona alias unavailable: ${String(error?.message ?? error)}`)
    }
    return () => {
      for (const dispose of disposers.reverse()) dispose()
    }
  })
}
