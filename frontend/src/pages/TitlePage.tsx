import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, fmtBytes, kindLabel, type Episode, type Indexer, type Location, type Release, type TitleDetailsT } from '../api'
import { btn, btnGhost, input, Modal, Notice, Spinner, Bar } from '../components/ui'
import { useToast } from '../components/Toast'
import { useAsync } from '../hooks'

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '').trim()

function DownloadModal({ release, title, kind, catalogRef, relDefault, onClose }: {
  release: Release; title: string; kind: string; catalogRef: string; relDefault: string; onClose: () => void
}) {
  const toast = useToast()
  const locs = useAsync(() => api<Location[]>('/storage/locations'), [])
  const [locId, setLocId] = useState<string>('')
  const [rel, setRel] = useState(relDefault)
  const [busy, setBusy] = useState(false)
  const chosen = locs.data?.find((l) => String(l.id) === locId) ?? locs.data?.find((l) => l.kind === kind && l.isDefault) ?? locs.data?.find((l) => l.kind === 'GENERAL' && l.isDefault)
  const enough = chosen ? chosen.usage.free > release.sizeBytes : false

  const start = async () => {
    setBusy(true)
    try {
      await api('/downloads', { method: 'POST', json: {
        title: release.title, kind, catalogRef, indexer: release.indexer, magnetUrl: release.magnetUrl, downloadUrl: release.downloadUrl,
        sizeBytes: release.sizeBytes, locationId: chosen?.id, relativePath: rel,
      } })
      toast('Download iniciado'); onClose()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }
  return (
    <Modal title="Iniciar download" onClose={onClose}>
      <dl className="mb-4 space-y-1 text-sm">
        <div><dt className="inline text-zinc-400">Conteúdo: </dt><dd className="inline break-all">{title}</dd></div>
        <div><dt className="inline text-zinc-400">Release: </dt><dd className="inline break-all">{release.title}</dd></div>
        <div><dt className="inline text-zinc-400">Qualidade: </dt><dd className="inline">{release.resolution} {release.source ?? ''} {release.codec ?? ''}</dd></div>
        <div><dt className="inline text-zinc-400">Tamanho estimado: </dt><dd className="inline">{fmtBytes(release.sizeBytes)}</dd></div>
      </dl>
      {locs.loading ? <Spinner /> : locs.data?.length === 0 ? <Notice text="Nenhuma pasta registrada. Vá em Armazenamento e registre uma." /> : (
        <>
          <label className="text-xs text-zinc-400">Disco / pasta de destino</label>
          <select className={input + ' mb-2'} value={chosen ? String(chosen.id) : ''} onChange={(e) => setLocId(e.target.value)}>
            {locs.data?.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.path} ({fmtBytes(l.usage.free)} livres)</option>)}
          </select>
          {chosen && <div className="mb-3"><Bar percent={chosen.percentUsed} warn={!enough} />
            <p className={`mt-1 text-xs ${enough ? 'text-zinc-400' : 'text-red-400'}`}>Espaço livre: {fmtBytes(chosen.usage.free)} {enough ? '' : '— insuficiente para este download'}</p></div>}
          <label className="text-xs text-zinc-400">Subpasta (opcional)</label>
          <input className={input + ' mb-4'} value={rel} onChange={(e) => setRel(e.target.value)} />
          <button className={btn} disabled={busy || !chosen || !enough} onClick={start}>Iniciar download</button>
        </>
      )}
    </Modal>
  )
}

function ReleaseSearch({ d }: { d: TitleDetailsT }) {
  const { item } = d
  const toast = useToast()
  const [query, setQuery] = useState(item.kind === 'MOVIE' && item.year ? `${item.title} ${item.year}` : item.title)
  const [indexers, setIndexers] = useState<Indexer[]>([])
  const [picked, setPicked] = useState<number[]>([])
  const [res, setRes] = useState('')
  const [audio, setAudio] = useState('')
  const [sub, setSub] = useState('')
  const [rows, setRows] = useState<Release[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [dl, setDl] = useState<Release | null>(null)

  useEffect(() => {
    api<Indexer[]>('/indexers').then((l) => setIndexers(l.filter((i) => i.enabled))).catch((e) => toast(e.message, 'err'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const search = async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ query, kind: item.kind })
      picked.forEach((p) => qs.append('indexerIds', String(p)))
      if (res) qs.set('resolution', res)
      setRows(await api<Release[]>('/search/releases?' + qs))
    } catch (e) { toast((e as Error).message, 'err'); setRows([]) } finally { setLoading(false) }
  }
  const hasPtBr = (r: Release) => r.subtitleHints.includes('Legenda PT-BR')
  const hasMulti = (r: Release) => r.subtitleHints.some((h) => h.startsWith('Multi-legendas'))
  const shown = rows?.filter((r) => (!audio || r.audioHints.includes(audio))
    && (!sub || hasPtBr(r) || (sub === 'ptbr+multi' && hasMulti(r))))
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xl font-semibold">Buscar downloads</h2>
      <p className="mb-2 text-xs text-zinc-500">Para séries/animes, acrescente a temporada ou o episódio à busca (ex.: "S01" ou "S01E03"). Use apenas conteúdo que você tem autorização para obter.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className={input + ' max-w-md'} value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className={input + ' w-auto'} value={res} onChange={(e) => setRes(e.target.value)}>
          <option value="">Qualquer resolução</option><option>4K</option><option>1080p</option><option>720p</option>
        </select>
        <select className={input + ' w-auto'} value={audio} onChange={(e) => setAudio(e.target.value)}>
          <option value="">Qualquer áudio</option><option>Português</option><option>Multi</option><option>Inglês</option><option>Japonês</option>
        </select>
        <select className={input + ' w-auto'} value={sub} onChange={(e) => setSub(e.target.value)}>
          <option value="">Qualquer legenda</option>
          <option value="ptbr">Legendado em PT-BR</option>
          <option value="ptbr+multi">PT-BR ou multi-legendas</option>
        </select>
        <button className={btn} disabled={loading} onClick={search}>{loading ? 'Buscando…' : 'Buscar'}</button>
      </div>
      {indexers.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-3 text-xs">
          <span className="text-zinc-400">Indexadores (vazio = todos):</span>
          {indexers.map((i) => (
            <label key={i.id} className="flex items-center gap-1"><input type="checkbox" checked={picked.includes(i.id)}
              onChange={(e) => setPicked(e.target.checked ? [...picked, i.id] : picked.filter((p) => p !== i.id))} />{i.name}</label>
          ))}
        </div>
      )}
      {shown && (shown.length === 0 ? <p className="text-sm text-zinc-500">Nenhum resultado.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-400"><tr><th className="py-2">Release</th><th>Qualidade</th><th>Tamanho</th><th>S/L</th><th>Idioma (pelo nome)</th><th>Indexador</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.guid + r.indexerId} className="border-t border-zinc-800 align-top">
                  <td className="max-w-md break-all py-2 pr-2">{r.title}</td>
                  <td>{r.resolution} <span className="text-xs text-zinc-500">{r.source} {r.codec}</span></td>
                  <td>{fmtBytes(r.sizeBytes)}</td>
                  <td>{r.seeders ?? '?'}/{r.leechers ?? '?'}</td>
                  <td className="text-xs">{[...r.audioHints, ...r.subtitleHints].join(', ') || 'não identificado'}</td>
                  <td className="text-xs">{r.indexer}</td>
                  <td><button className={btnGhost} onClick={() => setDl(r)}>Baixar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-zinc-500">O idioma é inferido do nome do arquivo e não é garantido. Após baixar, use "Verificar faixas" no player.</p>
        </div>
      ))}
      {dl && <DownloadModal release={dl} title={item.title} kind={item.kind} catalogRef={item.ref}
        relDefault={safeName(item.title) + (item.year ? ` (${item.year})` : '')} onClose={() => setDl(null)} />}
    </section>
  )
}

export default function TitlePage() {
  const { source, type, id } = useParams()
  const { data, loading, error } = useAsync(() => api<TitleDetailsT>(`/catalog/title/${source}/${type}/${id}`), [source, type, id])
  const [season, setSeason] = useState<number | null>(null)
  const eps = useAsync(() => (season == null ? Promise.resolve([] as Episode[]) : api<Episode[]>(`/catalog/title/tmdb/tv/${id}/seasons/${season}`)), [season, id])
  if (loading) return <Spinner />
  if (error || !data) return <Notice text={error ?? 'Não encontrado'} />
  const { item, seasons } = data
  return (
    <div>
      <div className="relative -mx-4 -mt-6 mb-6 h-64 overflow-hidden">
        {item.backdropUrl && <img src={item.backdropUrl} alt="" className="h-full w-full object-cover opacity-50" />}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-transparent" />
      </div>
      <div className="-mt-32 flex gap-6">
        {item.posterUrl && <img src={item.posterUrl} alt="" className="relative hidden w-48 rounded-lg shadow-xl md:block" />}
        <div className="relative">
          <h1 className="text-3xl font-bold">{item.title}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {kindLabel[item.kind]} · {item.year ?? '—'} {item.rating ? `· ★ ${item.rating.toFixed(1)}` : ''}
            {item.runtime ? ` · ${item.runtime} min` : ''} {item.seasons ? `· ${item.seasons} temporada(s)` : ''} {item.episodes ? `· ${item.episodes} episódios` : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">{item.genres.map((g) => <span key={g} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs">{g}</span>)}</div>
          <p className="mt-3 max-w-3xl text-sm text-zinc-300">{item.overview || 'Sem sinopse disponível.'}</p>
        </div>
      </div>
      {seasons.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-semibold">Temporadas</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            {seasons.map((s) => <button key={s.number} className={season === s.number ? btn : btnGhost} onClick={() => setSeason(s.number)}>T{s.number} ({s.episodeCount})</button>)}
          </div>
          {season != null && (eps.loading ? <Spinner /> : (
            <ul className="divide-y divide-zinc-800 text-sm">
              {eps.data?.map((e) => <li key={e.number} className="py-2"><b>{e.number}.</b> {e.name} <span className="text-xs text-zinc-500">{e.airDate}</span><p className="text-xs text-zinc-400">{e.overview}</p></li>)}
            </ul>
          ))}
        </section>
      )}
      <ReleaseSearch d={data} />
    </div>
  )
}
