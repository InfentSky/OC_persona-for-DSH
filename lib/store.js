import {
  ARRAY_FIELDS,
  STRING_FIELDS,
  createId,
  mergeAssignment,
  mergeCard,
  normalizeAssignment,
  resolveCard,
} from './persona.js'

const DOMAIN_NAME = 'oc_persona'
const DOMAIN_VERSION = 1
const ACCEPT_ANY = { parse: (value) => value }

function coerceStoredCard(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  if (typeof value.id !== 'string' || typeof value.name !== 'string' || value.name.trim() === '') return undefined
  const card = {
    id: value.id,
    schemaVersion: 1,
    name: value.name,
  }
  for (const field of STRING_FIELDS) card[field] = typeof value[field] === 'string' ? value[field] : ''
  for (const field of ARRAY_FIELDS) {
    card[field] = Array.isArray(value[field])
      ? value[field].filter((item) => typeof item === 'string')
      : []
  }
  card.createdAt = Number.isFinite(value.createdAt) ? value.createdAt : Date.now()
  card.updatedAt = Number.isFinite(value.updatedAt) ? value.updatedAt : card.createdAt
  card.version = Number.isFinite(value.version) ? value.version : 1
  return card
}

function coerceStoredAssignment(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const assignment = normalizeAssignment(value)
  if (assignment.personaId === null) assignment.mode = 'off'
  return assignment
}

/**
 * Open the profile's KV domain when available. Creative writing must keep
 * working if the profile has no storage backend, so every persistence failure
 * degrades to an in-memory library instead of failing activation.
 */
export async function createStore(ctx, settings = {}) {
  const cards = new Map()
  const assignments = new Map()
  let domain
  let persistent = false

  const storageDomain = ctx.get('storageDomain')
  if (storageDomain !== undefined) {
    try {
      domain = await storageDomain.open({
        name: DOMAIN_NAME,
        version: DOMAIN_VERSION,
        tables: {
          personas: { valueSchema: ACCEPT_ANY },
          sessions: { valueSchema: ACCEPT_ANY },
        },
      })
      for (const [id, value] of domain.table('personas').entries()) {
        const card = coerceStoredCard(value)
        if (card !== undefined) cards.set(id, card)
      }
      for (const [id, value] of domain.table('sessions').entries()) {
        const assignment = coerceStoredAssignment(value)
        if (assignment === undefined) continue
        if (assignment.personaId === null || !cards.has(assignment.personaId)) {
          await domain.table('sessions').delete(id)
          continue
        }
        assignments.set(id, assignment)
      }
      persistent = true
    } catch (error) {
      ctx.logger?.warn?.(`oc-persona: profile storage unavailable, using memory only: ${String(error?.message ?? error)}`)
      domain = undefined
    }
  }

  async function writeCard(card) {
    if (domain !== undefined) await domain.table('personas').put(card.id, card)
    cards.set(card.id, card)
  }

  async function writeAssignment(sessionId, assignment) {
    if (domain !== undefined) await domain.table('sessions').put(sessionId, assignment)
    assignments.set(sessionId, assignment)
  }

  return {
    get persistent() {
      return persistent
    },
    get storageLabel() {
      return persistent ? 'profile' : 'memory'
    },
    count() {
      return cards.size
    },
    listCards() {
      return [...cards.values()].sort((a, b) => b.updatedAt - a.updatedAt)
    },
    getCard(id) {
      return cards.get(id)
    },
    findCard(query) {
      return resolveCard([...cards.values()], query)
    },
    getAssignment(sessionId) {
      if (typeof sessionId !== 'string' || sessionId.length === 0) return normalizeAssignment(undefined)
      return normalizeAssignment(assignments.get(sessionId))
    },
    async saveCard(input, options = {}) {
      const raw = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {}
      const explicitId = typeof raw.id === 'string' && raw.id.trim() !== '' ? raw.id.trim() : undefined
      let existing = explicitId !== undefined ? cards.get(explicitId) : undefined
      if (existing === undefined && explicitId === undefined) existing = resolveCard([...cards.values()], raw.name)

      const card = mergeCard(existing, { ...raw, id: explicitId }, { replace: options.replace === true })
      if (existing === undefined && cards.has(card.id)) {
        if (explicitId !== undefined) throw new Error(`character id "${card.id}" is already in use`)
        do card.id = createId(card.name)
        while (cards.has(card.id))
      }
      await writeCard(card)
      return { card, created: existing === undefined }
    },
    async removeCard(id) {
      if (!cards.has(id)) return false
      if (domain !== undefined) await domain.table('personas').delete(id)
      cards.delete(id)
      for (const [sessionId, assignment] of [...assignments]) {
        if (assignment.personaId !== id) continue
        if (domain !== undefined) await domain.table('sessions').delete(sessionId)
        assignments.delete(sessionId)
      }
      return true
    },
    async setAssignment(sessionId, patch) {
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        throw new Error('this operation needs an owning agent session')
      }
      const next = mergeAssignment(assignments.get(sessionId), patch)
      if (next.personaId !== null && !cards.has(next.personaId)) {
        throw new Error(`character "${next.personaId}" no longer exists`)
      }
      if ((next.mode === 'roleplay' || next.mode === 'assist') && next.personaId === null) {
        throw new Error('choose a character before enabling roleplay or assist mode')
      }
      await writeAssignment(sessionId, next)
      return next
    },
    async close() {
      if (domain === undefined) return
      const closing = domain
      domain = undefined
      await closing.close()
    },
    settings,
  }
}
