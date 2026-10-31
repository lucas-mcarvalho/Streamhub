import { Link } from 'react-router-dom'
import { api, fmtEta, type Section } from '../api'
import { useAsync } from '../hooks'
import { Notice, Row, Spinner } from '../components/ui'

type Resume = { id: string; title: string; subtitle?: string; positionSeconds: number; durationSeconds: number; imageUrl: string; webUrl: string }

export default function Home() {
  const { data, loading, error } = useAsync(() => api<Section[]>('/catalog/home'), [])
  const resume = useAsync(() => api<Resume[]>('/library/resume'), [])
  const hero = data?.flatMap((s) => s.items).find((i) => i.backdropUrl)
  if (loading) return <Spinner />
  return (
    <div>
      {hero && (
        <Link to={`/title/${hero.source}/${hero.type}/${hero.id}`} className="relative mb-8 block h-72 overflow-hidden rounded-xl">
          <img src={hero.backdropUrl} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
          <div className="absolute bottom-4 left-6 max-w-xl">
            <h1 className="text-3xl font-bold">{hero.title}</h1>
            <p className="mt-1 line-clamp-2 text-sm text-zinc-300">{hero.overview}</p>
          </div>
        </Link>
      )}
      {error && <Notice text={error} />}
      {data?.every((s) => s.error) && (
        <Notice text="Catálogo indisponível. Configure a chave do TMDB em Configurações > Integrações (os animes usam o AniList e não exigem chave)." />
      )}
      {resume.data && resume.data.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold">Continuar assistindo (Jellyfin)</h2>
          <div className="flex gap-4 overflow-x-auto">
            {resume.data.map((r) => (
              <a key={r.id} href={r.webUrl} target="_blank" rel="noreferrer" className="w-56 shrink-0">
                <img src={r.imageUrl} alt="" className="aspect-video w-full rounded-lg bg-zinc-800 object-cover" />
                <div className="mt-1 truncate text-sm">{r.title}</div>
                <div className="text-xs text-zinc-400">{r.subtitle} · resta {fmtEta(Math.max(0, r.durationSeconds - r.positionSeconds))}</div>
              </a>
            ))}
          </div>
        </section>
      )}
      {data?.map((s) => <Row key={s.key} title={s.title} items={s.items} error={s.error} />)}
    </div>
  )
}
