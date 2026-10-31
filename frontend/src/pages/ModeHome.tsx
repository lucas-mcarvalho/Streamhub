import { Flame, Star, TrendingUp, Tv } from 'lucide-react'
import { api, type LibraryFile, type Section } from '../api'
import ContinueRow from '../components/ContinueRow'
import Hero from '../components/Hero'
import { Notice, Row } from '../components/ui'
import { useAsync } from '../hooks'
import { useForceTheme } from '../theme'

const icons: Record<string, JSX.Element> = {
  trending: <Flame size={20} className="text-accent-400" />, airing: <Tv size={20} className="text-accent-400" />,
  top: <Star size={20} className="text-accent-400" />, popular: <TrendingUp size={20} className="text-accent-400" />,
  movies: <Flame size={20} className="text-accent-400" />, series: <Tv size={20} className="text-accent-400" />,
  topMovies: <Star size={20} className="text-accent-400" />, topSeries: <Star size={20} className="text-accent-400" />,
}

export default function ModeHome({ mode }: { mode: 'cinema' | 'anime' }) {
  useForceTheme(mode)
  const { data, loading, error } = useAsync(() => api<Section[]>('/catalog/home?mode=' + mode), [mode])
  const lib = useAsync(() => api<LibraryFile[]>('/library'), [])
  const hero = data?.[0]?.items ?? []
  const allFailed = data?.every((s) => s.error)
  return (
    <div>
      {error && <Notice text={error} />}
      {allFailed && <div className="mb-6"><Notice text={data?.[0]?.error ?? 'Catálogo indisponível'} /></div>}
      {loading ? <div className="mb-10 h-[440px] animate-pulse rounded-3xl bg-surface2 md:h-[520px]" /> : <Hero items={hero} />}
      {lib.data && <ContinueRow files={lib.data.filter((f) => mode === 'anime' ? f.kind !== 'MOVIE' && f.kind !== 'SERIES' : f.kind !== 'ANIME')} />}
      {(loading ? [null, null, null] : data ?? []).map((s, i) => (
        <Row key={s?.key ?? i} title={s?.title ?? '…'} items={s?.items ?? []} error={s?.error} loading={loading} icon={s ? icons[s.key] : undefined} />
      ))}
    </div>
  )
}
