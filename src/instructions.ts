// SPDX-License-Identifier: Apache-2.0
/**
 * Project instructions -> the project folder's AGENTS.md (pure).
 *
 * dsh's own agent-instructions loader reads AGENTS.md from a chat's working
 * directory on every turn, so a chat started in the project folder gets the
 * project's instructions, files, memory rule and grounding rule with no
 * harness patch. Mirrors what ChatGPT/Claude/Mistral/Gemini projects offer:
 * instructions for every chat, project files, project-scoped memory, and a
 * sources-only mode (Gemini Notebook).
 * @module dsh-workspace-rail/instructions
 */

export const MEMORY_FILE = 'PROJECT-MEMORY.md'

export interface InstructionInput {
  name: string
  instructions?: string
  memory?: boolean
  strict?: boolean
  /** The project has files (uploads or links) worth searching. */
  hasFiles?: boolean
}

/** The AGENTS.md text for a project (empty string when there is nothing to say). */
export function composeAgentsMd(p: InstructionInput): string {
  const parts: string[] = []
  const own = (p.instructions ?? '').trim()
  if (own.length > 0) parts.push(own)
  if (p.strict === true) {
    parts.push([
      '## Sources',
      'Answer only from the files in this project folder. If they do not contain the answer, say so plainly;',
      'do not fill gaps from general knowledge or the web. Name the file you relied on.',
    ].join('\n'))
  }
  if (p.hasFiles === true) {
    parts.push([
      '## Project files',
      'Use the project_search tool to find the relevant passages in this project\'s files before answering questions about them, and cite file:line.',
    ].join('\n'))
  }
  if (p.memory === true) {
    parts.push([
      '## Project memory',
      `Read ./${MEMORY_FILE} at the start of each chat in this project.`,
      'When a durable fact, decision or preference comes up, add one short dated line to it.',
      'Keep it concise; never store secrets there.',
    ].join('\n'))
  }
  if (parts.length === 0) return ''
  return [`# Project: ${p.name.trim()}`, 'Files for this project live in this folder.', ...parts].join('\n\n') + '\n'
}

/** First meaningful line of the instructions, for the collapsed preview. */
export function instructionsPreview(text: string | undefined, max = 90): string {
  const line = (text ?? '').split('\n').map(l => l.trim()).find(l => l.length > 0) ?? ''
  return line.length > max ? line.slice(0, max - 1) + '…' : line
}
