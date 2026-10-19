import {
  ARRAY_FIELDS,
  DEFAULT_MODE,
  MODES,
  STRING_FIELDS,
  cardToMarkdown,
  modeLabel,
  normalizeMode,
  summaryLine,
} from './persona.js'

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    message: { type: 'string' },
  },
  required: ['ok', 'message'],
}

const CARD_PROPERTY_DESCRIPTIONS = {
  name: 'Canonical name. Required when creating; also acts as the lookup key when no id is given.',
  aliases: 'Other names, titles, or nicknames the character answers to.',
  tagline: 'One-line hook that captures the character in a phrase.',
  summary: 'Short premise in 2-4 sentences: who they are and what they are caught in.',
  role: 'Occupation, social role, or narrative function.',
  setting: 'World, era, place, genre, and the rules of the setting.',
  background: 'Formative history, current situation, and personal stakes.',
  appearance: 'Distinctive visual details: build, face, clothes, scars, objects they carry.',
  personality: 'Behavioral patterns, temperament, habits, and contradictions, shown through actions.',
  speechStyle: 'Register, rhythm, sentence length, vocabulary, code-switching, and what they avoid saying.',
  addressStyle: 'How they address different people: pronouns, honorifics, nicknames, formality shifts.',
  verbalTics: 'Recurring words, pauses, metaphors, or catchphrases. Keep them sparse and meaningful.',
  speechSamples: '2-5 short sample lines that demonstrate the voice.',
  psychology: 'Core wound or belief, defense mechanisms, attachment style, and internal conflict.',
  values: 'What they protect, pursue, or refuse to compromise.',
  desires: 'Conscious wants and unconscious needs.',
  fears: 'What they avoid, and how fear shows in behavior.',
  contradictions: 'Tensions that make the character feel real rather than consistent on paper.',
  expressions: 'Micro-expressions and tells: eyes, jaw, breath, hands, posture.',
  gestures: 'Recurring physical habits, props, and ways of occupying space.',
  triggers: 'Emotional triggers and the character\'s typical reaction under pressure.',
  secrets: 'Hidden facts, self-deceptions, and things they conceal from others.',
  relationships: 'Key people and the dynamic with each, written as short entries.',
  knowledge: 'What they know, skills, expertise, and biases.',
  limits: 'What they cannot know or do; anachronisms and out-of-character knowledge to avoid.',
  canon: 'Established facts that must not be contradicted. Append new stable facts here.',
  notes: 'Author notes, themes, performance guidance, or boundaries.',
}

function propertyFromDescription(description, type = 'string') {
  return type === 'array'
    ? { type: 'array', description, items: { type: 'string' } }
    : { type: 'string', description }
}

const CARD_PROPERTIES = {
  id: { type: 'string', description: 'Existing character id. Provide it to update exactly; omit to create or match by name.' },
  name: propertyFromDescription(CARD_PROPERTY_DESCRIPTIONS.name),
}
for (const field of STRING_FIELDS) {
  if (field !== 'name') CARD_PROPERTIES[field] = propertyFromDescription(CARD_PROPERTY_DESCRIPTIONS[field])
}
for (const field of ARRAY_FIELDS) CARD_PROPERTIES[field] = propertyFromDescription(CARD_PROPERTY_DESCRIPTIONS[field], 'array')

function tool(name, description, parameters, execute, options = {}) {
  return {
    name,
    description,
    parameters,
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: value.message }],
    },
    execute,
    ...options,
  }
}

function requireSession(exec) {
  if (exec.agent === undefined) throw new Error('this persona tool needs an owning agent session')
  return exec.agent.id
}

function assignmentLine(store, sessionId) {
  const assignment = store.getAssignment(sessionId)
  const card = assignment.personaId === null ? undefined : store.getCard(assignment.personaId)
  if (card === undefined) return 'Active character: none'
  return `Active character: ${card.name} (${card.id}) · mode: ${modeLabel(assignment.mode)} (${assignment.mode})`
}

function sceneText(assignment) {
  const entries = [
    ['Scene', assignment.scene],
    ['Mood', assignment.mood],
    ['Goal', assignment.goal],
    ['Relationship', assignment.relationship],
    ['Notes', assignment.notes],
  ].filter(([, value]) => value.length > 0)
  if (entries.length === 0) return ''
  return entries.map(([label, value]) => `- ${label}: ${value}`).join('\n')
}

function renderState(store, sessionId) {
  const assignment = store.getAssignment(sessionId)
  const scene = sceneText(assignment)
  return [
    assignmentLine(store, sessionId),
    scene.length > 0 ? `Current scene state:\n${scene}` : 'Current scene state: not set',
  ].join('\n')
}

function listText(store, sessionId) {
  const cards = store.listCards()
  const assignment = store.getAssignment(sessionId)
  const activeId = assignment.personaId
  const lines = [
    `OC Persona library — ${cards.length} character(s), storage: ${store.storageLabel}.`,
    assignmentLine(store, sessionId),
  ]
  if (cards.length === 0) {
    lines.push('', 'No characters yet. Describe a character and ask to create it, or use `/oc new <name>`.')
    return lines.join('\n')
  }
  lines.push('', 'Characters:')
  for (const card of cards.slice(0, 50)) {
    const marker = card.id === activeId ? ' [active]' : ''
    lines.push(`- ${summaryLine(card)}${marker}\n  id: ${card.id}`)
  }
  if (cards.length > 50) lines.push(`- … and ${cards.length - 50} more`)
  return lines.join('\n')
}

function readText(store, sessionId, query) {
  const assignment = store.getAssignment(sessionId)
  const card = query === undefined || query.trim() === ''
    ? (assignment.personaId === null ? undefined : store.getCard(assignment.personaId))
    : store.findCard(query)
  if (card === undefined) {
    throw new Error(query === undefined || query.trim() === ''
      ? 'no active character; pass a name or id'
      : `no character matches "${query}"`)
  }
  const state = sceneText(store.getAssignment(sessionId))
  return [
    cardToMarkdown(card),
    '',
    '---',
    `id: ${card.id} · version: ${card.version} · updated: ${new Date(card.updatedAt).toISOString()}`,
    assignmentLine(store, sessionId),
    state.length > 0 ? `Current scene state:\n${state}` : 'Current scene state: not set',
  ].join('\n')
}

function saveText(store, card, created) {
  const fields = []
  if (card.speechStyle) fields.push('voice')
  if (card.psychology) fields.push('psychology')
  if (card.expressions.length > 0 || card.gestures.length > 0) fields.push('body language')
  if (card.canon.length > 0) fields.push('canon')
  return [
    `${created ? 'Created' : 'Updated'} character "${card.name}" (${card.id}), version ${card.version}.`,
    fields.length > 0 ? `Structured areas now present: ${fields.join(', ')}.` : 'Add voice, psychology, and body-language detail when the user supplies it.',
    'Call `persona_activate` to put this character on stage, or keep co-writing with `persona_activate` mode=assist.',
  ].join('\n')
}

/** Register all model-facing persona tools. */
export function registerPersonaTools(ctx, store, settings = {}) {
  const defaultMode = normalizeMode(settings.defaultMode, DEFAULT_MODE)

  ctx.effect(() => ctx.tools.register(tool(
    'persona_list',
    'List the original-character library and show which character and mode are active in this session. Use before creating a duplicate or when the user asks who is available.',
    { type: 'object', properties: {}, additionalProperties: false },
    (args, exec) => Promise.resolve({
      ok: true,
      message: listText(store, requireSession(exec)),
    }),
    { isConcurrencySafe: () => true },
  )))

  ctx.effect(() => ctx.tools.register(tool(
    'persona_read',
    'Read one character card in full, including the active scene state. Omit `character` to read the active character. Use it before refining, roleplaying, or checking continuity.',
    {
      type: 'object',
      properties: {
        character: { type: 'string', description: 'Character id, name, or alias. Omit for the active character.' },
      },
      additionalProperties: false,
    },
    (args, exec) => Promise.resolve({
      ok: true,
      message: readText(store, requireSession(exec), typeof args.character === 'string' ? args.character : undefined),
    }),
    { isConcurrencySafe: () => true },
  )))

  ctx.effect(() => ctx.tools.register(tool(
    'persona_save',
    [
      'Create or refine an original character card from the user\'s text.',
      'Pass card fields as top-level parameters; do not wrap them in a `persona` object.',
      'For a single confirmed fact, use `persona_note` instead. For structural changes pass only `id` plus the one or two changed fields; do not resend the whole card unless the user asks for a full rewrite.',
      'Merge mode appends new list entries and replaces supplied text fields; `replace: true` rebuilds the card from exactly the supplied fields.',
      'This does not activate the character. After saving, call `persona_activate` with the intended mode unless the user only asked for a card.',
    ].join(' '),
    {
      type: 'object',
      properties: {
        ...CARD_PROPERTIES,
        replace: {
          type: 'boolean',
          description: 'Rebuild the whole card from the supplied fields instead of merging. Use only when the user asks for a rewrite.',
        },
      },
      additionalProperties: false,
    },
    async (args, exec) => {
      requireSession(exec)
      const { replace, persona, ...flat } = args
      const input = persona !== null && typeof persona === 'object' && !Array.isArray(persona)
        ? { ...flat, ...persona }
        : flat
      if (Object.keys(input).length === 0) throw new Error('pass at least one character field')
      const { card, created } = await store.saveCard(input, { replace: replace === true })
      return { ok: true, message: saveText(store, card, created) }
    },
  )))

  ctx.effect(() => ctx.tools.register(tool(
    'persona_note',
    'Append one confirmed, stable fact to a character\'s established canon. Use this instead of rewriting the card for a single detail. Omit `character` to use the active character.',
    {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'One confirmed fact to append to canon.' },
        character: { type: 'string', description: 'Character id, name, or alias. Omit for the active character.' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    async (args, exec) => {
      const sessionId = requireSession(exec)
      const text = typeof args.text === 'string' ? args.text.trim() : ''
      if (text.length === 0) throw new Error('text is required')
      const assignment = store.getAssignment(sessionId)
      const card = typeof args.character === 'string' && args.character.trim() !== ''
        ? store.findCard(args.character)
        : (assignment.personaId === null ? undefined : store.getCard(assignment.personaId))
      if (card === undefined) {
        throw new Error(typeof args.character === 'string' && args.character.trim() !== ''
          ? `no character matches "${args.character}"`
          : 'no active character; activate one or pass `character`')
      }
      const saved = await store.saveCard({ id: card.id, canon: [text] })
      return { ok: true, message: `Appended to canon for ${saved.card.name} (${saved.card.id}): ${text}` }
    },
  )))

  ctx.effect(() => ctx.tools.register(tool(
    'persona_activate',
    'Put a character on stage in this session and choose roleplay (embody them) or assist (co-write with them). Switching to a different character clears the previous scene state.',
    {
      type: 'object',
      properties: {
        character: { type: 'string', description: 'Character id, name, or alias.' },
        mode: {
          type: 'string',
          enum: ['roleplay', 'assist'],
          description: 'roleplay = speak as the character; assist = stay out of character and co-write. Defaults to roleplay.',
        },
      },
      required: ['character'],
      additionalProperties: false,
    },
    async (args, exec) => {
      const sessionId = requireSession(exec)
      if (typeof args.character !== 'string' || args.character.trim() === '') throw new Error('character is required')
      const card = store.findCard(args.character)
      if (card === undefined) throw new Error(`no character matches "${args.character}"; use persona_list`)
      const mode = normalizeMode(typeof args.mode === 'string' ? args.mode : defaultMode, defaultMode)
      if (mode === 'off') throw new Error('use persona_mode to switch off')
      const current = store.getAssignment(sessionId)
      const switching = current.personaId !== card.id
      const patch = {
        personaId: card.id,
        mode,
        ...(switching ? { scene: '', mood: '', goal: '', relationship: '', notes: '' } : {}),
      }
      await store.setAssignment(sessionId, patch)
      return {
        ok: true,
        message: `Now active: ${card.name} (${card.id}) · mode: ${modeLabel(mode)} (${mode}).\n${renderState(store, sessionId)}`,
      }
    },
  )))

  ctx.effect(() => ctx.tools.register(tool(
    'persona_mode',
    'Switch the current session between roleplay, assist, and off without changing the assigned character. `off` keeps the card for later but injects no persona prompt.',
    {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: MODES,
          description: 'roleplay = embody the character; assist = co-write out of character; off = no persona prompt.',
        },
      },
      required: ['mode'],
      additionalProperties: false,
    },
    async (args, exec) => {
      const sessionId = requireSession(exec)
      const mode = normalizeMode(args.mode, '')
      if (mode === '') throw new Error(`mode must be one of: ${MODES.join(', ')}`)
      const current = store.getAssignment(sessionId)
      if (mode !== 'off' && current.personaId === null) {
        throw new Error('no active character; call persona_activate first')
      }
      await store.setAssignment(sessionId, { mode })
      return {
        ok: true,
        message: `Mode set to ${modeLabel(mode)} (${mode}).\n${renderState(store, sessionId)}`,
      }
    },
  )))

  ctx.effect(() => ctx.tools.register(tool(
    'persona_state',
    'Update the current scene state for the active character: location, mood, immediate goal, relationship to the user, and continuity notes. Use when the scene moves or a durable emotional beat lands. Empty strings clear a field; `clear: true` clears all.',
    {
      type: 'object',
      properties: {
        scene: { type: 'string', description: 'Where and when the scene is, plus what just changed.' },
        mood: { type: 'string', description: 'The character\'s current mood and what it is doing to their behavior.' },
        goal: { type: 'string', description: 'What the character wants in this immediate beat.' },
        relationship: { type: 'string', description: 'How the character currently regards the user character: trust, tension, attraction, debt.' },
        notes: { type: 'string', description: 'Continuity facts that must survive a long scene.' },
        clear: { type: 'boolean', description: 'Clear all scene-state fields first.' },
      },
      additionalProperties: false,
    },
    async (args, exec) => {
      const sessionId = requireSession(exec)
      const current = store.getAssignment(sessionId)
      if (current.personaId === null) throw new Error('no active character; call persona_activate first')
      const patch = {}
      if (args.clear === true) {
        for (const field of ['scene', 'mood', 'goal', 'relationship', 'notes']) patch[field] = ''
      }
      for (const field of ['scene', 'mood', 'goal', 'relationship', 'notes']) {
        if (Object.hasOwn(args, field)) patch[field] = args[field]
      }
      await store.setAssignment(sessionId, patch)
      return { ok: true, message: `Scene state updated.\n${renderState(store, sessionId)}` }
    },
  )))

  ctx.effect(() => ctx.tools.register(tool(
    'persona_delete',
    'Permanently delete a character card and clear it from every session that had it active. Use only after the user explicitly asks to delete that exact character; require confirmation.',
    {
      type: 'object',
      properties: {
        character: { type: 'string', description: 'Character id, name, or alias.' },
        confirm: { type: 'boolean', description: 'Must be true, after explicit user confirmation.' },
      },
      required: ['character', 'confirm'],
      additionalProperties: false,
    },
    async (args, exec) => {
      requireSession(exec)
      if (args.confirm !== true) throw new Error('deletion requires confirm: true after explicit user confirmation')
      const card = store.findCard(args.character)
      if (card === undefined) throw new Error(`no character matches "${args.character}"`)
      await store.removeCard(card.id)
      return { ok: true, message: `Deleted character "${card.name}" (${card.id}).` }
    },
  )))
}
