import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createId,
  mergeCard,
  mergeAssignment,
  normalizeAssignment,
  resolveCard,
} from '../lib/persona.js'

test('creates a readable unique id for Latin and Chinese names', () => {
  const latin = createId('Lin Mo')
  const chinese = createId('林默')
  assert.match(latin, /^lin-mo-[0-9a-f]{8}$/)
  assert.match(chinese, /^oc-[0-9a-f]{8}$/)
  assert.notEqual(createId('Lin Mo'), latin)
})

test('creates a card and fills every field', () => {
  const card = mergeCard(undefined, {
    name: '  Lin Mo ',
    aliases: ['Mo', 'Mo'],
    speechStyle: 'Short, dry sentences.',
    canon: ['Left the capital at nineteen.'],
  })
  assert.equal(card.name, 'Lin Mo')
  assert.deepEqual(card.aliases, ['Mo'])
  assert.equal(card.speechStyle, 'Short, dry sentences.')
  assert.deepEqual(card.canon, ['Left the capital at nineteen.'])
  assert.equal(card.version, 1)
  assert.equal(card.schemaVersion, 1)
  assert.ok(card.id)
})

test('merge appends list entries and replaces supplied text', () => {
  const first = mergeCard(undefined, { name: 'A', canon: ['one'], speechStyle: 'soft' })
  const second = mergeCard(first, { canon: ['one', 'two'], speechStyle: 'clipped' })
  assert.deepEqual(second.canon, ['one', 'two'])
  assert.equal(second.speechStyle, 'clipped')
  assert.equal(second.id, first.id)
  assert.equal(second.version, 2)
})

test('replace rebuilds the card while preserving identity and name', () => {
  const first = mergeCard(undefined, { name: 'A', canon: ['one'], speechStyle: 'soft' })
  const second = mergeCard(first, { canon: ['three'] }, { replace: true })
  assert.deepEqual(second.canon, ['three'])
  assert.equal(second.speechStyle, '')
  assert.equal(second.id, first.id)
  assert.equal(second.name, 'A')
})

test('an explicit empty string clears a field', () => {
  const first = mergeCard(undefined, { name: 'A', speechStyle: 'soft' })
  const second = mergeCard(first, { speechStyle: '' })
  assert.equal(second.speechStyle, '')
})

test('a new card without a name is rejected', () => {
  assert.throws(() => mergeCard(undefined, { summary: 'nobody' }), /name is required/)
})

test('resolves by id, exact name, and alias', () => {
  const a = mergeCard(undefined, { name: 'Lin Mo', aliases: ['Mo'] })
  const b = mergeCard(undefined, { name: 'Yan' })
  const cards = [a, b]
  assert.equal(resolveCard(cards, a.id)?.id, a.id)
  assert.equal(resolveCard(cards, 'lin mo')?.id, a.id)
  assert.equal(resolveCard(cards, 'MO')?.id, a.id)
  assert.equal(resolveCard(cards, 'nobody'), undefined)
})

test('assignment defaults and state merge', () => {
  const empty = normalizeAssignment(undefined)
  assert.equal(empty.mode, 'off')
  assert.equal(empty.personaId, null)
  const next = mergeAssignment(empty, { personaId: 'a-1', mode: 'roleplay', scene: 'rooftop', mood: 'wary' })
  assert.equal(next.personaId, 'a-1')
  assert.equal(next.mode, 'roleplay')
  assert.equal(next.scene, 'rooftop')
  const cleared = mergeAssignment(next, { scene: '' })
  assert.equal(cleared.scene, '')
  assert.equal(cleared.mood, 'wary')
})
