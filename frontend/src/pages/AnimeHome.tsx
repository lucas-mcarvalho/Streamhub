import { api, type LibraryFile, type Section } from '../api'
import AnimeHero from '../components/AnimeHero'
import AnimeRow from '../components/AnimeRow'
import ContinueRow from '../components/ContinueRow'
import { Notice } from '../components/ui'
import { useAsync } from '../hooks'
import { useForceTheme } from '../theme'

const TITLES: Record<string, string> = {
  airing: 'Lançamentos da temporada', trending: 'Em alta agora', top: 'Top 10 animes', popular: 'Populares de todos os tempos',
}
const ORDER = ['airing', 'trending', 'top', 'popular']

export default function AnimeHome() {
  useForceTheme('anime')
  const { data, loading, error } = useAsync(() => api<Section[]>('/catalog/home?mode=anime'), [])
  const lib = useAsync(() => api<LibraryFile[]>('/library'), [])
  const byKey = new Map((data ?? []).map((s) => [s.key, s]))
  const hero = byKey.get('trending')?.items ?? []
  const failed = data?.length && data.every((s) => s.error)
  return (
    <div>
      {loading ? <div className="h-[80vh] min-h-[540px] w-full animate-pulse bg-surface2" /> : <AnimeHero items={hero} />}
      <div className="relative z-10 mx-auto -mt-16 max-w-[1500px] px-5 md:px-10">
        {error && <Notice text={error} />}
        {failed ? <div className="mb-6"><Notice text={data?.[0]?.error ?? 'Catálogo indisponível'} /></div> : null}
        {lib.data && <ContinueRow files={lib.data.filter((f) => f.kind !== 'MOVIE' && f.kind !== 'SERIES')} />}
        {(loading ? ORDER.map((k) => ({ key: k, title: TITLES[k], items: [] }) as Section) : ORDER.map((k) => byKey.get(k)).filter((s): s is Section => !!s))
          .map((s) => <AnimeRow key={s.key} title={TITLES[s.key] ?? s.title} items={s.items} error={s.error} loading={loading} ranked={s.key === 'top'} />)}
      </div>
    </div>
  )
}
