export type Cue = { start: number; end: number; text: string }

function parseTime(value: string) {
  const parts = value.trim().replace(',', '.').split(':').map(Number)
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) return NaN
  return parts.reduce((seconds, part) => seconds * 60 + part, 0)
}

export function parseVtt(text: string): Cue[] {
  const cues: Cue[] = []
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n')
    if (/^(NOTE|STYLE|REGION)(\s|$)/.test(lines[0])) continue
    const i = lines.findIndex((line) => line.includes('-->'))
    if (i < 0) continue
    const [a, b] = lines[i].split('-->')
    if (!b) continue
    const start = parseTime(a), end = parseTime(b.trim().split(/\s/)[0])
    const body = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').trim()
    if (body && Number.isFinite(start) && Number.isFinite(end) && end > start) cues.push({ start, end, text: body })
  }
  return cues.sort((a, b) => a.start - b.start)
}

/** Keep simultaneous dialogue/signs; an older cue must not hide a newer line. Positive delay shows subtitles later. */
export function subtitleAt(cues: Cue[], videoTime: number, delay = 0) {
  const time = videoTime - delay
  const active: string[] = []
  for (const cue of cues) {
    if (cue.start > time) break
    if (time < cue.end && !active.includes(cue.text)) active.push(cue.text)
  }
  return active.join('\n')
}

export function transcodeStart(offset: number) {
  return Math.max(0, offset).toFixed(3)
}
