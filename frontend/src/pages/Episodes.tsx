import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { api, progressOf, type CatalogItem, type GuideEpisode, type LibraryFile } from '../api'
import EpisodeGrid from '../components/EpisodeGrid'
import { Notice, Score, Spinner } from '../components/ui'
import { useAsync } from '../hooks'
import { useProgressSync } from '../lib/progress'

/** Tela só com os episódios de um título da biblioteca, em grade com capa e estado de assistido. */
export default function Episodes() {
  const { kind = '', group = '' } = useParams()
  const files = useAsync(() => api<LibraryFile[]>('/library'), [])
  const meta = useAsync(() => api<CatalogItem | undefined>(`/catalog/match?title=${encodeURIComponent(group)}&kind=${kind}`), [group, kind])
  const guide = useAsync(() => (kind === 'MOVIE' ? Promise.resolve([] as GuideEpisode[]) : api<GuideEpisode[]>(`/catalog/episode-guide?title=${encodeURIComponent(group)}&kind=${kind}`)), [group, kind])
  const [, setTick] = useState(0)
  useProgressSync()

  const items = useMemo(() => (files.data ?? []).filter((f) => f.group === group && f.kind === kind), [files.data, group, kind])
  const watched = items.filter((f) => progressOf(f.id).done).length

  if (files.error) return <Notice text={files.error} />
  if (files.loading) return <Spinner />
  if (items.length === 0) return <Notice text="Nenhum episódio deste título foi encontrado na biblioteca." />
  const m = meta.data
  return (
    <div>
      <div className="relative -mx-4 mb-6 overflow-hidden px-4 pb-6 pt-4 sm:rounded-2xl">
        {(m?.backdropUrl || m?.posterUrl) && <img src={m.backdropUrl ?? m.posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/80 to-transparent" />
        <div className="relative flex gap-5">
          {m?.posterUrl && <img src={m.posterUrl} alt="" className="hidden w-28 shrink-0 rounded-xl shadow-xl ring-1 ring-white/10 sm:block" />}
          <div className="min-w-0 self-end">
            <Link to={kind === 'ANIME' ? '/library?tab=anime' : '/library?tab=cinema'} className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white"><ArrowLeft size={16} />Biblioteca</Link>
            <h1 className="font-display text-3xl font-bold tracking-wide sm:text-4xl">{m?.title ?? group}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
              <Score value={m?.rating} />
              <span>{items.length} episódio(s)</span>
              <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 size={14} />{watched} assistido(s)</span>
            </div>
          </div>
        </div>
      </div>
      <EpisodeGrid files={items} guide={guide.data ?? undefined} guideLoading={guide.loading} onChange={() => setTick((t) => t + 1)} />
    </div>
  )
}
