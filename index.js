import { registerPersonaCommands } from './lib/commands.js'
import { buildPersonaPrompt } from './lib/prompt.js'
import { createStore } from './lib/store.js'
import { registerPersonaTools } from './lib/tools.js'
import { normalizeMode } from './lib/persona.js'

export const name = 'oc-persona'
export const inject = ['tools', 'systemPrompt', 'commands']

function normalizeSettings(config) {
  const raw = config !== null && typeof config === 'object' && !Array.isArray(config) ? config : {}
  const budget = Number(raw.promptBudget)
  const mode = normalizeMode(raw.defaultMode, 'roleplay')
  return {
    promptBudget: Number.isFinite(budget) ? Math.min(Math.max(Math.trunc(budget), 3000), 40000) : 8000,
    defaultMode: mode === 'off' ? 'roleplay' : mode,
  }
}

function sessionIdOf(context) {
  const id = context?.agent?.id
  if (typeof id === 'string') return id
  const fallback = context?.scope?.id
  return typeof fallback === 'string' ? fallback : undefined
}

/**
 * The OC Persona bundle: a persistent character library, model-facing tools,
 * a per-session mode switch, and a dynamic system-prompt section.
 */
export async function apply(ctx, config = {}) {
  const settings = normalizeSettings(config)
  const store = await createStore(ctx, settings)

  ctx.effect(() => () => store.close())

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'oc-persona',
    order: 10250,
    interpolate: false,
    text: (context) => {
      const sessionId = sessionIdOf(context)
      if (sessionId === undefined) return buildPersonaPrompt({ card: undefined, assignment: undefined, settings })
      const assignment = store.getAssignment(sessionId)
      const card = assignment.personaId === null ? undefined : store.getCard(assignment.personaId)
      return buildPersonaPrompt({ card, assignment, settings })
    },
  }))

  registerPersonaTools(ctx, store, settings)
  registerPersonaCommands(ctx, store, settings)

  ctx.logger?.info?.(`oc-persona: ${store.count()} character(s), storage=${store.storageLabel}`)
}
