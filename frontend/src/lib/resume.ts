// De onde continuar um título: o episódio que ficou pela metade ou, se o último visto terminou, o seguinte.
import { progressOf, type LibraryFile } from '../api'
import { sameEpisode, versionsOf } from './versions'

export type Resume = {
  file: LibraryFile
  /** continue: parou no meio · next: o anterior terminou · start: nada visto ainda · again: tudo visto */
  mode: 'continue' | 'next' | 'start' | 'again'
  /** Segundos em que parou (só em `continue`). */
  pos: number
  /** Quando o título foi assistido pela última vez (0 = nunca). */
  last: number
}

export const fmtTime = (t: number) => {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60)
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0')
}

/** "T2 E5", "E12" ou vazio para arquivos sem número. */
export const episodeTag = (f: LibraryFile) => (f.episode == null ? '' : f.season != null ? `T${f.season} E${f.episode}` : `E${f.episode}`)

/** Calcula o ponto de retomada entre os arquivos de um único título. */
export function resumeOf(files: LibraryFile[]): Resume | undefined {
  // extras sem número (aberturas, encerramentos) não entram na sequência quando há episódios numerados
  const numbered = files.filter((f) => f.episode != null)
  const list = [...(numbered.length ? numbered : files)].sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0)
    || a.name.localeCompare(b.name, undefined, { numeric: true }))
  if (list.length === 0) return undefined

  let lastFile: LibraryFile | undefined
  let last = 0
  for (const f of list) {
    const p = progressOf(f.id)
    if ((p.pos > 0 || p.done) && p.last > last) { lastFile = f; last = p.last }
  }
  // entre as versões de um episódio, a mesma qualidade do último assistido; sem ela, a melhor
  const pick = (f: LibraryFile) => {
    const versions = versionsOf(list, f)
    return (lastFile?.quality && versions.find((v) => v.quality === lastFile?.quality)) || versions[0]
  }
  if (!lastFile) return { file: pick(list[0]), mode: 'start', pos: 0, last: 0 }

  const p = progressOf(lastFile.id)
  if (!p.done) return { file: lastFile, mode: 'continue', pos: p.pos, last }

  const done = (f: LibraryFile) => versionsOf(list, f).some((v) => progressOf(v.id).done)
  const next = list.slice(list.indexOf(lastFile) + 1).find((f) => !sameEpisode(f, lastFile!) && !done(f))
  return next ? { file: pick(next), mode: 'next', pos: 0, last } : { file: pick(list[0]), mode: 'again', pos: 0, last }
}

/** Texto do botão: "Continuar T1 E5", "Próximo: T1 E6", "Assistir E1", "Assistir de novo". */
export function resumeLabel(r: Resume) {
  const tag = episodeTag(r.file)
  if (r.mode === 'continue') return tag ? `Continuar ${tag}` : 'Continuar'
  if (r.mode === 'next') return `Próximo: ${tag || r.file.name}`
  if (r.mode === 'again') return 'Assistir de novo'
  return tag ? `Assistir ${tag}` : 'Assistir'
}
