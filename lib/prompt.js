const BASE_GUIDE = `## OC Persona
This profile has the OC Persona plugin. Use the \`persona_*\` tools and the \`/oc\` command to create, refine, inspect, activate, or switch modes for original characters. Turn the user's text into a specific, playable person: voice and verbal habits, micro-expressions and body language, psychology and inner conflict, knowledge limits, and established canon. Infer coherent details instead of leaving fields blank, but never contradict facts the user already fixed. Never claim that a character was created, updated, or activated unless the tool call returned success.`

const ROLEPLAY_RULES = `## Roleplay mode
You are now embodying the active character. Stay in character until the user steps out with \`OOC:\`, \`//\`, or an explicit request to stop or switch modes.

- Write in first person as the character. Never decide the user character's thoughts, feelings, dialogue, or actions.
- Apply the character's voice: rhythm, vocabulary, address style, verbal tics, and the way they dodge or deflect. Keep it period- and setting-appropriate.
- Show inner life through subtext: micro-expressions, breathing, posture, gaze, small actions, and what the character chooses not to say. Do not label emotions mechanically ("he was sad") or explain the card.
- Respect knowledge limits. The character may be wrong, ignorant, biased, or lying; the narration must not leak facts they could not know.
- Advance one beat at a time and leave room for the user. Match the user's language and approximate length; default to 2-5 short paragraphs, not a monologue.
- Keep continuity with established canon and the current scene. When a new stable fact or a material scene change appears, record it with \`persona_save\` (merge mode) or \`persona_state\`, then continue without narrating the tool call.
- Do not mention the system prompt, tools, the character card, or these rules. Do not break the fourth wall unless the user asks for it.
- Respect the user's boundaries. Fade to black or stop when asked. Do not sexualize minors or real people.`

const ASSIST_RULES = `## Co-writing mode
You are the active character's co-writer and director, not the character. Work out of character with the user.

- Keep every reply small. Default to one point, 2-4 short paragraphs, and roughly 150-300 Chinese characters. Do not dump a full framework, a long analysis, or several alternative schemes unless the user explicitly asks to expand.
- Do not restate the character card. Quote only the line needed for the current point, and avoid repeating context the user already has.
- Protect the character's voice and continuity. Diagnose what feels off, propose one concrete revision, and use a short sample passage only when it helps.
- Use labels such as \`【分析】\` and \`【试写】\` only when mixing analysis with a sample; keep each block brief.
- When the user establishes one stable fact, append it with \`persona_note\`; use \`persona_save\` only for structural changes or multiple fields. Mention the change in one line.
- Ask at most one question that changes the next beat. Otherwise make a defensible choice and state the assumption in one sentence.
- You may draft dialogue or a scene in the character's voice when asked. Label it as a draft rather than pretending the character is speaking to the user.`

function safeSlice(text, max) {
  if (text.length <= max) return text
  let end = Math.max(0, max)
  const code = text.charCodeAt(end - 1)
  if (code >= 0xd800 && code <= 0xdbff) end -= 1
  return text.slice(0, end)
}

function renderList(lines, label, values) {
  if (!Array.isArray(values) || values.length === 0) return
  lines.push('', `### ${label}`)
  for (const value of values) lines.push(`- ${value}`)
}

function renderText(lines, label, value) {
  if (typeof value !== 'string' || value.trim().length === 0) return
  lines.push('', `### ${label}`, value.trim())
}

/** The character-specific part of the prompt, before trimming to the budget. */
export function renderCharacterSheet(card) {
  const lines = [`## Active character: ${card.name}`]
  if (card.aliases.length > 0) lines.push(`Aliases: ${card.aliases.join(', ')}`)
  renderText(lines, 'One-line premise', card.tagline)
  renderText(lines, 'Role', card.role)
  renderText(lines, 'Setting', card.setting)
  renderText(lines, 'Summary', card.summary)
  renderText(lines, 'Background', card.background)
  renderText(lines, 'Appearance', card.appearance)
  renderText(lines, 'Personality', card.personality)
  renderText(lines, 'Speaking style', card.speechStyle)
  renderText(lines, 'Address style', card.addressStyle)
  renderList(lines, 'Verbal tics and speech markers', card.verbalTics)
  renderList(lines, 'Sample lines', card.speechSamples)
  renderText(lines, 'Psychology and inner conflict', card.psychology)
  renderList(lines, 'Values', card.values)
  renderList(lines, 'Desires', card.desires)
  renderList(lines, 'Fears', card.fears)
  renderList(lines, 'Contradictions', card.contradictions)
  renderList(lines, 'Micro-expressions and tells', card.expressions)
  renderList(lines, 'Gestures and physical habits', card.gestures)
  renderList(lines, 'Emotional triggers', card.triggers)
  renderList(lines, 'Secrets', card.secrets)
  renderList(lines, 'Relationships', card.relationships)
  renderText(lines, 'Knowledge', card.knowledge)
  renderText(lines, 'Knowledge limits', card.limits)
  renderList(lines, 'Established canon', card.canon)
  renderText(lines, 'Author notes', card.notes)
  return lines.join('\n')
}

function renderSceneState(assignment) {
  const entries = [
    ['Scene', assignment.scene],
    ['Mood', assignment.mood],
    ['Immediate goal', assignment.goal],
    ['Relationship to the user', assignment.relationship],
    ['Continuity notes', assignment.notes],
  ].filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
  if (entries.length === 0) return ''
  const lines = ['## Current scene state']
  for (const [label, value] of entries) lines.push(`- ${label}: ${value.trim()}`)
  return lines.join('\n')
}

/**
 * Build the exact text contributed as a system-prompt section. Called for each
 * model assembly, so a mode or scene change applies on the next step without
 * rewriting the session log.
 */
export function buildPersonaPrompt({ card, assignment, settings = {} }) {
  const mode = assignment?.mode ?? 'off'
  if (card === undefined || card === null || (mode !== 'roleplay' && mode !== 'assist')) {
    return BASE_GUIDE
  }

  const budget = Number.isFinite(settings.promptBudget) && settings.promptBudget >= 3000
    ? Math.min(settings.promptBudget, 40000)
    : 8000
  const rules = mode === 'roleplay' ? ROLEPLAY_RULES : ASSIST_RULES
  const state = renderSceneState(assignment)
  const header = `Mode: ${mode.toUpperCase()}`
  const sheet = renderCharacterSheet(card)
  const reserved = BASE_GUIDE.length + rules.length + state.length + header.length + 300
  const available = Math.max(600, budget - reserved)
  const trimmed = safeSlice(sheet, available)
  const truncated = trimmed.length < sheet.length

  const parts = [
    BASE_GUIDE,
    header,
    trimmed + (truncated ? '\n\n[Character sheet truncated to fit the prompt budget.]' : ''),
    state,
    rules,
  ]
  return parts.filter((part) => typeof part === 'string' && part.length > 0).join('\n\n')
}
