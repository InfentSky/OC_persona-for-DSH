import { randomBytes } from 'node:crypto'

/** The three persona modes. `off` keeps the card assigned but injects no persona prompt. */
export const MODES = ['roleplay', 'assist', 'off']
export const DEFAULT_MODE = 'roleplay'

/** Free-text card fields, in the order the prompt prefers. */
export const STRING_FIELDS = [
  'tagline',
  'summary',
  'role',
  'setting',
  'background',
  'appearance',
  'personality',
  'speechStyle',
  'addressStyle',
  'psychology',
  'knowledge',
  'limits',
  'notes',
]

/** List-valued card fields. */
export const ARRAY_FIELDS = [
  'aliases',
  'values',
  'desires',
  'fears',
  'contradictions',
  'speechSamples',
  'verbalTics',
  'expressions',
  'gestures',
  'triggers',
  'secrets',
  'relationships',
  'canon',
]

export const CARD_FIELDS = ['name', ...STRING_FIELDS, ...ARRAY_FIELDS]

/** Session-scoped scene state that supplements the durable card. */
export const STATE_FIELDS = ['scene', 'mood', 'goal', 'relationship', 'notes']

export const LIMITS = {
  name: 120,
  stringField: 12000,
  listItem: 800,
  listLength: 60,
  cardJson: 120000,
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

/** A fresh, readable id. Chinese-only names use the `oc` stem. */
export function createId(name) {
  const stem = String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${stem || 'oc'}-${randomBytes(4).toString('hex')}`
}

export function isMode(value) {
  return MODES.includes(value)
}

export function normalizeMode(value, fallback = DEFAULT_MODE) {
  return isMode(value) ? value : fallback
}

export function modeLabel(mode) {
  switch (mode) {
    case 'roleplay': return '扮演'
    case 'assist': return '共创'
    case 'off': return '关闭'
    default: return String(mode)
  }
}

function asObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('persona must be a JSON object')
  }
  return value
}

function normalizeString(value, field, max = LIMITS.stringField) {
  if (value === undefined) return undefined
  if (value === null) return ''
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    throw new Error(`persona.${field} must be a string`)
  }
  const text = String(value).trim()
  if (text.length > max) throw new Error(`persona.${field} is too long (${text.length} > ${max} characters)`)
  return text
}

function normalizeList(value, field) {
  if (value === undefined) return undefined
  if (value === null) return []
  const raw = typeof value === 'string' ? [value] : value
  if (!Array.isArray(raw)) throw new Error(`persona.${field} must be an array of strings`)
  const out = []
  const seen = new Set()
  for (const item of raw) {
    if (item === null || item === undefined) continue
    if (typeof item !== 'string' && typeof item !== 'number' && typeof item !== 'boolean') {
      throw new Error(`persona.${field} items must be strings`)
    }
    const text = String(item).trim()
    if (text.length === 0) continue
    if (text.length > LIMITS.listItem) {
      throw new Error(`persona.${field} item is too long (${text.length} > ${LIMITS.listItem} characters)`)
    }
    if (seen.has(text)) continue
    seen.add(text)
    out.push(text)
    if (out.length > LIMITS.listLength) {
      throw new Error(`persona.${field} has too many items (max ${LIMITS.listLength})`)
    }
  }
  return out
}

function union(existing = [], incoming = []) {
  const out = [...existing]
  const seen = new Set(out)
  for (const item of incoming) {
    if (seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out.slice(0, LIMITS.listLength)
}

function emptyCard() {
  const card = { name: '' }
  for (const field of STRING_FIELDS) card[field] = ''
  for (const field of ARRAY_FIELDS) card[field] = []
  return card
}

/**
 * Merge a model-supplied patch into an existing card, or create a new one.
 * Arrays append uniquely unless `replace` is true; an explicitly supplied
 * empty string clears a text field.
 */
export function mergeCard(existing, input, { replace = false } = {}) {
  const raw = asObject(input)
  const source = replace ? emptyCard() : structuredClone(existing ?? emptyCard())
  if (replace && existing !== undefined) source.name = existing.name

  if (Object.hasOwn(raw, 'name')) {
    const name = normalizeString(raw.name, 'name', LIMITS.name)
    if (name !== undefined) source.name = name
  }
  if (source.name.trim().length === 0) {
    throw new Error('persona.name is required when creating a character')
  }

  for (const field of STRING_FIELDS) {
    if (!Object.hasOwn(raw, field)) continue
    const value = normalizeString(raw[field], field)
    if (value !== undefined) source[field] = value
  }
  for (const field of ARRAY_FIELDS) {
    if (!Object.hasOwn(raw, field)) continue
    const value = normalizeList(raw[field], field)
    if (value === undefined) continue
    source[field] = replace ? value : union(source[field], value)
  }

  const now = Date.now()
  const id = existing?.id ?? (typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : createId(source.name))
  const card = {
    id,
    schemaVersion: 1,
    ...source,
    name: source.name.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    version: (existing?.version ?? 0) + 1,
  }

  const serialized = JSON.stringify(card)
  if (serialized.length > LIMITS.cardJson) {
    throw new Error(`persona card is too large (${serialized.length} > ${LIMITS.cardJson} characters)`)
  }
  return card
}

/** Resolve a card by exact id first, then name or alias (case-insensitive). */
export function resolveCard(cards, query) {
  const q = String(query ?? '').trim()
  if (q.length === 0) return undefined
  const lower = q.toLowerCase()
  const byId = cards.find((card) => card.id.toLowerCase() === lower)
  if (byId) return byId
  const matches = cards.filter((card) =>
    card.name.toLowerCase() === lower
    || card.aliases.some((alias) => alias.toLowerCase() === lower))
  if (matches.length <= 1) return matches[0]
  return [...matches].sort((a, b) => b.updatedAt - a.updatedAt)[0]
}

export function normalizeAssignment(value) {
  const raw = value && typeof value === 'object' ? value : {}
  const assignment = {
    personaId: typeof raw.personaId === 'string' && raw.personaId.length > 0 ? raw.personaId : null,
    mode: normalizeMode(raw.mode, 'off'),
    scene: typeof raw.scene === 'string' ? raw.scene : '',
    mood: typeof raw.mood === 'string' ? raw.mood : '',
    goal: typeof raw.goal === 'string' ? raw.goal : '',
    relationship: typeof raw.relationship === 'string' ? raw.relationship : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
  }
  return assignment
}

/** Merge a session-state patch. An explicitly empty string clears that field. */
export function mergeAssignment(existing, patch) {
  const base = normalizeAssignment(existing)
  const raw = patch && typeof patch === 'object' ? patch : {}
  const next = { ...base }
  if (Object.hasOwn(raw, 'personaId')) {
    if (raw.personaId === null || raw.personaId === '') next.personaId = null
    else if (typeof raw.personaId === 'string') next.personaId = raw.personaId.trim()
  }
  if (Object.hasOwn(raw, 'mode')) next.mode = normalizeMode(raw.mode, next.mode)
  for (const field of STATE_FIELDS) {
    if (!Object.hasOwn(raw, field)) continue
    if (raw[field] === null) {
      next[field] = ''
      continue
    }
    if (typeof raw[field] !== 'string') throw new Error(`state.${field} must be a string`)
    next[field] = raw[field].trim().slice(0, 4000)
  }
  next.updatedAt = Date.now()
  return next
}

export function summaryLine(card) {
  const bits = [card.name]
  if (card.tagline) bits.push(card.tagline)
  else if (card.summary) bits.push(card.summary.split(/[。.!?！？\n]/)[0])
  return bits.filter(Boolean).join(' — ')
}

/** A deterministic Markdown view used by commands and the `persona_read` tool. */
export function cardToMarkdown(card) {
  const lines = [`# ${card.name}`, '']
  if (card.aliases.length > 0) lines.push(`别名：${card.aliases.join('、')}`)
  if (card.tagline) lines.push(`一句话：${card.tagline}`)
  if (card.role) lines.push(`身份：${card.role}`)
  if (card.setting) lines.push(`背景设定：${card.setting}`)
  if (card.summary) lines.push('', card.summary)
  const fields = [
    ['背景', card.background],
    ['外貌', card.appearance],
    ['性格', card.personality],
    ['说话方式', card.speechStyle],
    ['称呼习惯', card.addressStyle],
    ['心理结构', card.psychology],
    ['知识范围', card.knowledge],
    ['认知边界', card.limits],
    ['创作备注', card.notes],
  ]
  for (const [label, value] of fields) {
    if (value) lines.push('', `## ${label}`, value)
  }
  const lists = [
    ['价值观', card.values],
    ['欲望', card.desires],
    ['恐惧', card.fears],
    ['内在矛盾', card.contradictions],
    ['口癖与语言标记', card.verbalTics],
    ['神态与微表情', card.expressions],
    ['动作习惯', card.gestures],
    ['情绪触发点', card.triggers],
    ['秘密', card.secrets],
    ['关系', card.relationships],
    ['已确立事实', card.canon],
    ['台词样本', card.speechSamples],
  ]
  for (const [label, values] of lists) {
    if (!values || values.length === 0) continue
    lines.push('', `## ${label}`)
    for (const value of values) lines.push(`- ${value}`)
  }
  return lines.join('\n')
}
