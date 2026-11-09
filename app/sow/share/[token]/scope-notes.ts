export type ScopeSection = {
  label: string
  /** Heading detail kept from the source line, such as "(desktop and mobile)". */
  note: string
  paragraphs: string[]
  items: string[]
}

const MARKERS: { label: string; pattern: RegExp }[] = [
  { label: 'Key templates', pattern: /^key templates\b/i },
  { label: 'Front-end code', pattern: /^(front-end code|frontend code)\b/i },
  { label: 'Process and feedback', pattern: /^(process and feedback|feedback)\b/i },
  { label: 'Not included', pattern: /^not included\b/i },
  { label: 'Dependencies', pattern: /^dependencies\b/i },
]

function startSection(line: string, marker: (typeof MARKERS)[number]): ScopeSection {
  const colon = line.indexOf(':')
  const head = (colon >= 0 ? line.slice(0, colon) : line).trim()
  const rest = colon >= 0 ? line.slice(colon + 1).trim() : ''
  const note = head.replace(marker.pattern, '').trim()
  const sentence = rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : ''
  return {
    label: marker.label,
    note,
    paragraphs: sentence ? [sentence] : [],
    items: [],
  }
}

/** Split free-text scope notes into labelled sections. Unrecognised notes stay as Overview. */
export function parseScopeNotes(notes: string): ScopeSection[] {
  const sections: ScopeSection[] = [{ label: 'Overview', note: '', paragraphs: [], items: [] }]
  let buffer = ''

  function flushBuffer() {
    const text = buffer.trim()
    buffer = ''
    if (!text) return
    sections[sections.length - 1].paragraphs.push(text)
  }

  for (const rawLine of notes.split(/\r?\n/)) {
    const line = rawLine.trim()
    const marker = MARKERS.find((item) => item.pattern.test(line))
    if (marker) {
      flushBuffer()
      sections.push(startSection(line, marker))
      continue
    }
    if (!line) {
      flushBuffer()
      continue
    }
    const numbered = line.match(/^\d+\.\s+(.*)$/)
    if (numbered) {
      flushBuffer()
      sections[sections.length - 1].items.push(numbered[1])
      continue
    }
    buffer = buffer ? `${buffer} ${line}` : line
  }
  flushBuffer()

  return sections.filter((section) => section.paragraphs.length > 0 || section.items.length > 0)
}
