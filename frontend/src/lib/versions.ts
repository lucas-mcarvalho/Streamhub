// Versões de um episódio: o mesmo episódio guardado em mais de um arquivo, cada um com uma qualidade.
import { fmtBytes, progressOf, type LibraryFile } from '../api'
import { saveProgress } from './progress'

/** Linhas da imagem, para ordenar da melhor qualidade para a pior ("4K" = 2160; desconhecida = 0). */
export const qualityRank = (q?: string | null) => (!q ? 0 : /4k/i.test(q) ? 2160 : parseInt(q, 10) || 0)

export const sameEpisode = (a: LibraryFile, b: LibraryFile) =>
  a.episode != null && a.episode === b.episode && (a.season ?? null) === (b.season ?? null) && a.group === b.group && a.kind === b.kind

/** Ordem das versões: da melhor qualidade para a pior e, no empate, o arquivo maior primeiro. */
export const byQuality = (a: LibraryFile, b: LibraryFile) => qualityRank(b.quality) - qualityRank(a.quality) || b.sizeBytes - a.sizeBytes

/** Todos os arquivos do mesmo episódio (inclusive o próprio), da melhor qualidade para a pior. */
export const versionsOf = (files: LibraryFile[], f: LibraryFile) => files.filter((x) => x.id === f.id || sameEpisode(x, f)).sort(byQuality)

/** Versão que o usuário vinha assistindo; sem histórico, a de melhor qualidade (a primeira). */
export const preferredVersion = (versions: LibraryFile[]) =>
  versions.reduce((best, v) => (progressOf(v.id).last > progressOf(best.id).last ? v : best), versions[0])

/** Nome de cada versão para o seletor; o tamanho entra quando duas têm a mesma qualidade ou ela é desconhecida. */
export function versionLabel(f: LibraryFile, versions: LibraryFile[], withSize = false) {
  const q = f.quality ?? 'Outra'
  const ambiguous = !f.quality || versions.some((v) => v.id !== f.id && (v.quality ?? 'Outra') === q)
  return withSize || ambiguous ? `${q} · ${fmtBytes(f.sizeBytes)}` : q
}

/** Qualidades disponíveis entre os arquivos, da melhor para a pior. */
export const qualitiesOf = (files: LibraryFile[]) =>
  [...new Set(files.map((f) => f.quality).filter((q): q is string => !!q))].sort((a, b) => qualityRank(b) - qualityRank(a))

/** Ao trocar de versão, a nova continua de onde a outra parou (se a outra tiver o registro mais recente). */
export function carryProgress(from: LibraryFile, to: LibraryFile) {
  if (from.id === to.id) return
  const p = progressOf(from.id)
  if (p.last > progressOf(to.id).last && (p.pos > 0 || p.done)) saveProgress(to.id, { pos: p.pos, dur: p.dur, done: p.done })
}
