import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeCard } from '../lib/persona.js'
import { buildPersonaPrompt } from '../lib/prompt.js'

const card = mergeCard(undefined, {
  name: 'Lin Mo',
  tagline: 'A disgraced cartographer who maps forbidden streets.',
  speechStyle: 'Clipped, watchful, avoids direct answers.',
  verbalTics: ['counts under their breath'],
  expressions: ['jaw tightens before a lie'],
  psychology: 'Believes every attachment is a future betrayal.',
  canon: ['Owes a debt to the Night Market.'],
})

test('injects the full character sheet in roleplay mode', () => {
  const text = buildPersonaPrompt({
    card,
    assignment: { personaId: card.id, mode: 'roleplay', scene: 'A rain-soaked archive' },
  })
  assert.match(text, /Active character: Lin Mo/)
  assert.match(text, /Clipped, watchful/)
  assert.match(text, /Roleplay mode/)
  assert.match(text, /first person/)
  assert.match(text, /Current scene state/)
  assert.match(text, /rain-soaked archive/)
})

test('assist mode gets co-writing rules instead of roleplay rules', () => {
  const text = buildPersonaPrompt({
    card,
    assignment: { personaId: card.id, mode: 'assist' },
  })
  assert.match(text, /Co-writing mode/)
  assert.doesNotMatch(text, /Roleplay mode/)
  assert.match(text, /not the character/)
})

test('off mode and no card expose only the base guide', () => {
  const off = buildPersonaPrompt({ card, assignment: { personaId: card.id, mode: 'off' } })
  const none = buildPersonaPrompt({ card: undefined, assignment: undefined })
  assert.doesNotMatch(off, /Roleplay mode/)
  assert.doesNotMatch(off, /Active character/)
  assert.match(off, /OC Persona/)
  assert.match(none, /OC Persona/)
})

test('a large card is trimmed to the prompt budget', () => {
  const huge = mergeCard(undefined, {
    name: 'Huge',
    background: 'x'.repeat(12000),
    personality: 'y'.repeat(12000),
    notes: 'z'.repeat(12000),
  })
  const text = buildPersonaPrompt({
    card: huge,
    assignment: { personaId: huge.id, mode: 'roleplay' },
    settings: { promptBudget: 4000 },
  })
  assert.match(text, /Character sheet truncated/)
  assert.ok(text.length < 4600, `prompt was ${text.length} characters`)
})
