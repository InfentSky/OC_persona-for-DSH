import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../index.js'

function harness() {
  const tools = []
  const sections = []
  const commands = []
  const disposers = []
  const ctx = {
    get: () => undefined,
    logger: { info() {}, warn() {}, debug() {} },
    effect(callback) {
      const disposer = callback()
      if (typeof disposer === 'function') disposers.push(disposer)
      return disposer
    },
    tools: {
      register(definition) {
        tools.push(definition)
        return () => {
          const index = tools.indexOf(definition)
          if (index !== -1) tools.splice(index, 1)
        }
      },
    },
    systemPrompt: {
      section(section) {
        sections.push(section)
        return () => {
          const index = sections.indexOf(section)
          if (index !== -1) sections.splice(index, 1)
        }
      },
    },
    commands: {
      register(definition) {
        commands.push(definition)
        return () => {
          const index = commands.indexOf(definition)
          if (index !== -1) commands.splice(index, 1)
        }
      },
    },
  }
  return { ctx, tools, sections, commands, disposers }
}

test('registers the expected tools, prompt section, and commands', async () => {
  const h = harness()
  await apply(h.ctx, { promptBudget: 6000, defaultMode: 'assist' })
  assert.deepEqual(
    h.tools.map((tool) => tool.name),
    ['persona_list', 'persona_read', 'persona_save', 'persona_note', 'persona_activate', 'persona_mode', 'persona_state', 'persona_delete'],
  )
  assert.equal(h.sections.length, 1)
  assert.equal(h.sections[0].order, 10250)
  assert.equal(h.sections[0].interpolate, false)
  assert.deepEqual(h.commands.map((command) => command.name), ['oc', 'persona'])

  for (const tool of h.tools) {
    assert.equal(tool.parameters.type, 'object')
    assert.equal(tool.output.schema.additionalProperties, false)
    assert.equal(typeof tool.output.render, 'function')
  }

  const save = h.tools.find((tool) => tool.name === 'persona_save')
  assert.ok(save.parameters.properties.name)
  assert.equal(save.parameters.properties.persona, undefined)
  assert.equal(save.parameters.required, undefined)
})

test('saves, activates, and injects a character for one session only', async () => {
  const h = harness()
  await apply(h.ctx, {})
  const save = h.tools.find((tool) => tool.name === 'persona_save')
  const note = h.tools.find((tool) => tool.name === 'persona_note')
  const activate = h.tools.find((tool) => tool.name === 'persona_activate')
  const read = h.tools.find((tool) => tool.name === 'persona_read')

  const saved = await save.execute({
    name: 'Lin Mo',
    speechStyle: 'Clipped and watchful.',
    expressions: ['jaw tightens before a lie'],
    psychology: 'Expects betrayal.',
  }, { agent: { id: 'session-a' } })
  assert.match(saved.message, /Created character "Lin Mo"/)

  const before = h.sections[0].text({ agent: { id: 'session-a' } })
  assert.doesNotMatch(before, /Active character: Lin Mo/)

  const activated = await activate.execute({ character: 'Lin Mo', mode: 'roleplay' }, { agent: { id: 'session-a' } })
  assert.match(activated.message, /Now active: Lin Mo/)
  const prompt = h.sections[0].text({ agent: { id: 'session-a' } })
  assert.match(prompt, /Active character: Lin Mo/)
  assert.match(prompt, /Clipped and watchful/)
  assert.match(prompt, /Roleplay mode/)

  const noted = await note.execute({ text: 'Keeps old photographs in a tin box.' }, { agent: { id: 'session-a' } })
  assert.match(noted.message, /Appended to canon/)

  const other = h.sections[0].text({ agent: { id: 'session-b' } })
  assert.doesNotMatch(other, /Active character: Lin Mo/)

  const cardText = await read.execute({ character: 'Lin Mo' }, { agent: { id: 'session-a' } })
  assert.match(cardText.message, /Lin Mo/)
  assert.match(cardText.message, /jaw tightens/)
  assert.match(cardText.message, /Keeps old photographs/)
})

test('command surface can create, switch mode, preview, and delete', async () => {
  const h = harness()
  await apply(h.ctx, { defaultMode: 'roleplay' })
  const oc = h.commands.find((command) => command.name === 'oc')
  const run = (rawInput) => oc.handler({ agent: { id: 'session-c' }, rawInput })

  const created = await run('new Yan')
  assert.equal(created.kind, 'success')
  assert.match(created.text, /Yan/)

  const used = await run('use Yan assist')
  assert.equal(used.kind, 'success')
  assert.match(used.text, /共创/)

  const preview = await run('prompt')
  assert.equal(preview.kind, 'success')
  assert.match(preview.text, /Co-writing mode/)
  assert.match(preview.text, /Active character: Yan/)

  const noConfirm = await run('delete Yan')
  assert.equal(noConfirm.kind, 'error')
  assert.match(noConfirm.text, /confirm/)

  const removed = await run('delete Yan confirm')
  assert.equal(removed.kind, 'success')
  assert.match(removed.text, /已永久删除/)
  const list = await run('list')
  assert.match(list.text, /角色库为空|共 0 个/)
})

test('deleting a character clears the session assignment and its scene state', async () => {
  const h = harness()
  await apply(h.ctx, {})
  const save = h.tools.find((tool) => tool.name === 'persona_save')
  const activate = h.tools.find((tool) => tool.name === 'persona_activate')
  const state = h.tools.find((tool) => tool.name === 'persona_state')
  const remove = h.tools.find((tool) => tool.name === 'persona_delete')

  const { message } = await save.execute({ name: 'Temporary' }, { agent: { id: 'session-e' } })
  assert.match(message, /Temporary/)
  await activate.execute({ character: 'Temporary', mode: 'assist' }, { agent: { id: 'session-e' } })
  await state.execute({ scene: 'somewhere', mood: 'tense' }, { agent: { id: 'session-e' } })
  await remove.execute({ character: 'Temporary', confirm: true }, { agent: { id: 'session-e' } })

  const prompt = h.sections[0].text({ agent: { id: 'session-e' } })
  assert.doesNotMatch(prompt, /Temporary|somewhere|tense/)
  await assert.rejects(
    state.execute({ scene: 'again' }, { agent: { id: 'session-e' } }),
    /no active character/,
  )
})

test('state updates require an active character and flow into the prompt', async () => {
  const h = harness()
  await apply(h.ctx, {})
  const save = h.tools.find((tool) => tool.name === 'persona_save')
  const activate = h.tools.find((tool) => tool.name === 'persona_activate')
  const state = h.tools.find((tool) => tool.name === 'persona_state')

  await assert.rejects(
    state.execute({ scene: 'rooftop' }, { agent: { id: 'session-d' } }),
    /no active character/,
  )
  await save.execute({ name: 'Yan' }, { agent: { id: 'session-d' } })
  await activate.execute({ character: 'Yan', mode: 'assist' }, { agent: { id: 'session-d' } })
  await state.execute({ scene: 'A rooftop at midnight', mood: 'restless' }, { agent: { id: 'session-d' } })
  const prompt = h.sections[0].text({ agent: { id: 'session-d' } })
  assert.match(prompt, /A rooftop at midnight/)
  assert.match(prompt, /restless/)
})
