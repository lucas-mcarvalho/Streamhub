import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api, type CatalogItem, type LibraryFile, type Section } from '../api'
import Billboard from '../components/Billboard'
import CatalogRow from '../components/CatalogRow'
import ContinueRow from '../components/ContinueRow'
import { Notice } from '../components/ui'
import { useAsync } from '../hooks'

export type Tab = 'cinema' | 'anime'

type RowDef = { key: string; title: string; ranked?: boolean; more?: string }

const ROWS: Record<Tab, RowDef[]> = {
  cinema: [
    { key: 'movies', title: 'Filmes em alta', more: '/movies' },
    { key: 'series', title: 'Séries em alta', more: '/series' },
    { key: 'topMovies', title: 'Top 10 filmes', ranked: true, more: '/movies?sort=SCORE' },
    { key: 'topSeries', title: 'Séries mais bem avaliadas', more: '/series?sort=SCORE' },
  ],
  anime: [
    { key: 'trending', title: 'Em alta agora', more: '/animes/explore?sort=TRENDING' },
    { key: 'airing', title: 'Lançamentos da temporada', more: '/animes/explore?sort=AIRING' },
    { key: 'top', title: 'Top 10 animes', ranked: true, more: '/animes/explore?sort=SCORE' },
    { key: 'popular', title: 'Populares de todos os tempos', more: '/animes/explore' },
  ],
}

const SHORTCUTS: Record<Tab, [string, string][]> = {
  cinema: [['Filmes', '/movies'], ['Séries', '/series'], ['Lançamentos', '/movies?sort=NEW']],
  anime: [['Explorar animes', '/animes/explore'], ['Em exibição', '/animes/explore?sort=AIRING'], ['Buscar', '/animes/explore?search=1']],
}

/** intercala os itens de várias fileiras: filme, série, filme, série… */
function mix(lists: CatalogItem[][]): CatalogItem[] {
  const out: CatalogItem[] = []
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) lists.forEach((l) => { if (l[i]) out.push(l[i]) })
  return out
}

const TAB_LABEL: [Tab, string][] = [['cinema', 'Filmes e Séries'], ['anime', 'Animes']]

/** Tela única de Filmes e Séries; a aba "Animes" troca o conteúdo na própria tela (?aba=animes). */
export default function Browse() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('aba') === 'animes' ? 'anime' : 'cinema'
  const pick = (t: Tab) => { setParams(t === 'anime' ? { aba: 'animes' } : {}); window.scrollTo({ top: 0 }) }
  const { data, loading, error } = useAsync(() => api<Section[]>('/catalog/home?mode=' + tab), [tab])
  const lib = useAsync(() => api<LibraryFile[]>('/library'), [])
  const byKey = new Map((data ?? []).map((s) => [s.key, s]))
  const hero = tab === 'anime' ? byKey.get('trending')?.items ?? [] : mix([byKey.get('movies')?.items ?? [], byKey.get('series')?.items ?? []])
  const failed = data?.length && data.every((s) => s.error)
  const continueFiles = lib.data?.filter((f) => (tab === 'anime' ? f.kind === 'ANIME' : f.kind === 'MOVIE' || f.kind === 'SERIES'))

  const tabs = (
    <div className="absolute left-0 top-28 z-10 px-4 md:px-12 lg:top-20">
      <div className="flex items-end gap-6">
        {TAB_LABEL.map(([t, label]) => (
          <button key={t} onClick={() => pick(t)}
            className={`relative pb-1.5 font-display text-3xl tracking-wide transition md:text-4xl ${tab === t ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
            {label}
            {tab === t && <motion.span layoutId="browse-tab" className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-accent-500" />}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SHORTCUTS[tab].map(([label, to]) => (
          <Link key={to} to={to} className="rounded-full border border-white/40 bg-black/40 px-3.5 py-1 text-xs font-semibold backdrop-blur transition hover:border-white hover:bg-white/10">{label}</Link>
        ))}
      </div>
    </div>
  )

  return (
    <div>
      {loading ? <div className="relative h-[82vh] min-h-[520px] w-full animate-pulse bg-surface">{tabs}</div> : <Billboard items={hero}>{tabs}</Billboard>}
      <div className="relative z-10 -mt-20 px-4 md:-mt-28 md:px-12">
        {error && <div className="mb-6"><Notice text={error} /></div>}
        {failed ? <div className="mb-6"><Notice text={data?.[0]?.error ?? 'Catálogo indisponível'} /></div> : null}
        {continueFiles && <ContinueRow files={continueFiles} />}
        {ROWS[tab].map((r) => {
          const s = byKey.get(r.key)
          if (!loading && !s) return null
          return <CatalogRow key={tab + r.key} title={r.title} items={s?.items ?? []} error={s?.error} loading={loading} ranked={r.ranked} more={r.more} />
        })}
      </div>
    </div>
  )
}
