import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import { Calendar, Clapperboard, Clock, Film, Layers, Mic2, Radio, Tv, User, Users } from 'lucide-react'
import { api, fmtBytes, formatPt, genrePt, statusPt, type Episode, type Indexer, type Location, type Person, type Release, type TitleDetailsT } from '../api'
import { useForceTheme } from '../theme'
import { btn, btnGhost, input, Modal, Notice, Spinner, Bar, Chip, Score } from '../components/ui'
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
  const isPack = kind !== 'MOVIE' && release.episode == null
  const [chooseFiles, setChooseFiles] = useState(isPack)
  const chosen = locs.data?.find((l) => String(l.id) === locId) ?? locs.data?.find((l) => l.kind === kind && l.isDefault) ?? locs.data?.find((l) => l.kind === 'GENERAL' && l.isDefault)
  const enough = chosen ? chosen.usage.free > release.sizeBytes : false

  const start = async () => {
    setBusy(true)
    try {
      await api('/downloads', { method: 'POST', json: {
        title: release.title, kind, catalogRef, indexer: release.indexer, magnetUrl: release.magnetUrl, downloadUrl: release.downloadUrl,
        sizeBytes: release.sizeBytes, locationId: chosen?.id, relativePath: rel, chooseFiles,
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
          <label className="mb-4 flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-surface2/40 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 accent-accent-500" checked={chooseFiles} onChange={(e) => setChooseFiles(e.target.checked)} />
            <span><b>Escolher quais episódios baixar</b><br /><span className="text-xs text-zinc-400">
              {isPack ? 'Este release parece um pacote com vários episódios. ' : ''}O download pausa assim que a lista de arquivos estiver disponível e você marca só o que quer.</span></span>
          </label>
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
  const [seasonQ, setSeasonQ] = useState('')
  const [seasonF, setSeasonF] = useState('')
  const [epF, setEpF] = useState('')
  const isShow = item.kind !== 'MOVIE'
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
      const sq = seasonQ ? ` S${seasonQ.padStart(2, '0')}` : ''
      const qs = new URLSearchParams({ query: query + sq, kind: item.kind })
      picked.forEach((p) => qs.append('indexerIds', String(p)))
      if (res) qs.set('resolution', res)
      setSeasonF(seasonQ)
      setRows(await api<Release[]>('/search/releases?' + qs))
    } catch (e) { toast((e as Error).message, 'err'); setRows([]) } finally { setLoading(false) }
  }
  const hasPtBr = (r: Release) => r.subtitleHints.includes('Legenda PT-BR')
  const hasMulti = (r: Release) => r.subtitleHints.some((h) => h.startsWith('Multi-legendas'))
  const inSeason = (r: Release, n: number) => r.season != null && n >= r.season && n <= (r.seasonEnd ?? r.season)
  const seasonsFound = [...new Set((rows ?? []).flatMap((r) => (r.season == null ? [] : Array.from({ length: (r.seasonEnd ?? r.season) - r.season + 1 }, (_, i) => r.season! + i))))].sort((a, b) => a - b)
  const hasUnknown = (rows ?? []).some((r) => r.season == null)
  const shown = rows?.filter((r) => {
    if (!isShow || !seasonF) return true
    if (seasonF === 'none') return r.season == null
    const n = Number(seasonF)
    return inSeason(r, n) && (!epF || r.episode == null || r.episode === Number(epF))
  }).filter((r) => (!audio || r.audioHints.includes(audio))
    && (!sub || hasPtBr(r) || (sub === 'ptbr+multi' && hasMulti(r))))
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xl font-semibold">Buscar downloads</h2>
      <p className="mb-2 text-xs text-zinc-500">Para séries/animes, acrescente a temporada ou o episódio à busca (ex.: "S01" ou "S01E03"). Use apenas conteúdo que você tem autorização para obter.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className={input + ' max-w-md'} value={query} onChange={(e) => setQuery(e.target.value)} />
        {isShow && <input className={input + ' !w-28'} type="number" min={1} placeholder="Temporada" value={seasonQ} onChange={(e) => setSeasonQ(e.target.value)} title="Acrescenta SNN à busca (ex.: 1 → S01)" />}
        <select className={input + ' !w-auto'} value={res} onChange={(e) => setRes(e.target.value)}>
          <option value="">Qualquer resolução</option><option>4K</option><option>1080p</option><option>720p</option>
        </select>
        <select className={input + ' !w-auto'} value={audio} onChange={(e) => setAudio(e.target.value)}>
          <option value="">Qualquer áudio</option><option>Português</option><option>Multi</option><option>Inglês</option><option>Japonês</option>
        </select>
        <select className={input + ' !w-auto'} value={sub} onChange={(e) => setSub(e.target.value)}>
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
      {isShow && rows && rows.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-400">Filtrar resultados por temporada:</span>
          <select className={input + ' !w-auto'} value={seasonF} onChange={(e) => setSeasonF(e.target.value)}>
            <option value="">Todas</option>
            {seasonsFound.map((n) => <option key={n} value={n}>Temporada {n}</option>)}
            {hasUnknown && <option value="none">Sem temporada no nome (numeração contínua)</option>}
          </select>
          {seasonF && seasonF !== 'none' && <input className={input + ' !w-28'} type="number" min={1} placeholder="Episódio" value={epF} onChange={(e) => setEpF(e.target.value)} />}
        </div>
      )}
      {shown && (shown.length === 0 ? <p className="text-sm text-zinc-500">Nenhum resultado.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-400"><tr><th className="py-2">Release</th><th>Qualidade</th><th>Tamanho</th><th title="Seeders / leechers: mais seeders = download mais rápido">Seeders</th><th>Idioma (pelo nome)</th><th>Indexador</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.guid + r.indexerId} className="border-t border-line align-top">
                  <td className="max-w-md break-all py-2 pr-2">{r.title}{isShow && <span className="ml-2 whitespace-nowrap rounded bg-surface2 px-1.5 text-xs text-zinc-300">{r.season == null ? 'temporada ?' : r.seasonEnd ? `T${r.season}–${r.seasonEnd}` : `T${r.season}${r.episode != null ? ' E' + r.episode : ''}`}</span>}</td>
                  <td>{r.resolution} <span className="text-xs text-zinc-500">{r.source} {r.codec}</span></td>
                  <td>{fmtBytes(r.sizeBytes)}</td>
                  <td title={(r.seeders ?? 0) < 5 ? 'Poucos seeders: o download tende a ser lento' : 'Boa quantidade de seeders'}>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.seeders == null ? 'bg-surface2 text-zinc-400' : r.seeders >= 20 ? 'bg-emerald-500/20 text-emerald-300' : r.seeders >= 5 ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>{r.seeders ?? '?'}</span>
                    <span className="ml-1 text-xs text-zinc-500">/ {r.leechers ?? '?'}</span></td>
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

function ScoreRing({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value * 10))
  const r = 34, c = 2 * Math.PI * r
  const color = value >= 8 ? '#34d399' : value >= 7 ? '#a3e635' : value >= 6 ? '#fbbf24' : '#fb923c'
  return (
    <div className="relative grid h-24 w-24 place-items-center">
      <svg viewBox="0 0 80 80" className="absolute inset-0 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(var(--line))" strokeWidth="6" />
        <motion.circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct / 100) }} transition={{ duration: 1.4, ease: 'easeOut', delay: 0.3 }} />
      </svg>
      <div className="text-center leading-none"><div className="text-2xl font-extrabold">{value.toFixed(1)}</div><div className="mt-0.5 text-[10px] text-zinc-400">/ 10</div></div>
    </div>
  )
}

function Fact({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value?: string | number | null }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-surface2/60 px-3 py-2">
      <Icon size={16} className="text-accent-400" />
      <div className="leading-tight"><div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div><div className="text-sm font-semibold">{value}</div></div>
    </div>
  )
}

function Avatar({ p, size }: { p: Person; size: number }) {
  return p.photoUrl
    ? <img src={p.photoUrl} alt={p.name} loading="lazy" className="shrink-0 rounded-full object-cover ring-2 ring-accent-500/40" style={{ width: size, height: size }} />
    : <span className="grid shrink-0 place-items-center rounded-full bg-surface2 text-zinc-500 ring-2 ring-line" style={{ width: size, height: size }}><User size={size / 2.4} /></span>
}

function CastSection({ directors, cast }: { directors: Person[]; cast: Person[] }) {
  if (directors.length === 0 && cast.length === 0) return null
  return (
    <section className="mt-10">
      {directors.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 flex items-center gap-2 font-display text-2xl font-semibold tracking-wide"><Clapperboard size={20} className="text-accent-400" />{directors[0].role === 'Criação' ? 'Criação' : 'Direção'}</h2>
          <div className="flex flex-wrap gap-3">
            {directors.map((d) => (
              <motion.div key={d.name + d.role} whileHover={{ y: -3 }} className="glass flex items-center gap-3 rounded-full py-1.5 pl-1.5 pr-5">
                <Avatar p={d} size={44} /><div className="leading-tight"><div className="text-sm font-semibold">{d.name}</div><div className="text-[11px] text-zinc-400">{d.role}</div></div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
      {cast.length > 0 && (
        <>
          <h2 className="mb-4 flex items-center gap-2 font-display text-2xl font-semibold tracking-wide"><Users size={20} className="text-accent-400" />Elenco principal</h2>
          <div className="no-scrollbar flex gap-4 overflow-x-auto pb-3">
            {cast.map((c, n) => (
              <motion.div key={c.name + n} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: Math.min(n, 8) * 0.05 }}
                whileHover={{ y: -6 }} className="glass w-32 shrink-0 rounded-2xl p-3 text-center">
                <div className="mx-auto mb-2 w-fit"><Avatar p={c} size={88} /></div>
                <div className="truncate text-sm font-semibold" title={c.name}>{c.name}</div>
                <div className="line-clamp-2 min-h-[2rem] text-[11px] leading-tight text-zinc-400" title={c.role}>{c.role || '—'}</div>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

export default function TitlePage() {
  const { source, type, id } = useParams()
  const { data, loading, error } = useAsync(() => api<TitleDetailsT>(`/catalog/title/${source}/${type}/${id}`), [source, type, id])
  useForceTheme(data ? (data.item.kind === 'ANIME' ? 'anime' : 'cinema') : undefined)
  const [season, setSeason] = useState<number | null>(null)
  const [full, setFull] = useState(false)
  const eps = useAsync(() => (season == null ? Promise.resolve([] as Episode[]) : api<Episode[]>(`/catalog/title/tmdb/tv/${id}/seasons/${season}`)), [season, id])
  const { scrollY } = useScroll()
  const bgY = useTransform(scrollY, [0, 400], [0, 120])
  if (loading) return <Spinner />
  if (error || !data) return <Notice text={error ?? 'Não encontrado'} />
  const { item, seasons } = data
  const anime = item.kind === 'ANIME'
  const genres = anime ? item.genres.map(genrePt) : item.genres
  const exploreTo = (g: string) => (anime ? `/anime/explore?genre=${encodeURIComponent(item.genres[genres.indexOf(g)])}` : undefined)
  const long = (item.overview ?? '').length > 380
  return (
    <div>
      <div className="relative -mx-4 -mt-6 h-72 overflow-hidden md:h-96">
        {item.backdropUrl && <motion.img style={{ y: bgY }} src={item.backdropUrl} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60" initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/60 to-transparent" />
      </div>
      <div className="relative -mt-40 flex flex-col gap-8 md:flex-row">
        <motion.div initial={{ opacity: 0, y: 40, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ type: 'spring', damping: 18 }}
          whileHover={{ scale: 1.03, rotate: 1 }} className="mx-auto w-52 shrink-0 md:mx-0 md:w-64">
          {item.posterUrl ? <img src={item.posterUrl} alt={item.title} className={`w-full shadow-2xl shadow-black/70 ring-1 ring-white/10 ${anime ? 'rounded-3xl' : 'rounded-xl'}`} />
            : <div className="aspect-[2/3] rounded-xl bg-surface2" />}
        </motion.div>
        <motion.div className="flex-1" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
          <motion.h1 variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="font-display text-4xl font-bold leading-tight tracking-wide md:text-6xl">{item.title}</motion.h1>
          {item.originalTitle && item.originalTitle !== item.title && <motion.p variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }} className="mt-1 text-sm text-zinc-400">{item.originalTitle}</motion.p>}
          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="mt-5 flex flex-wrap items-center gap-4">
            {item.rating ? <ScoreRing value={item.rating} /> : null}
            <div className="flex flex-wrap gap-2.5">
              <Fact icon={Calendar} label="Ano" value={item.year} />
              <Fact icon={Film} label="Formato" value={formatPt(item.format)} />
              <Fact icon={Layers} label="Episódios" value={item.episodes} />
              <Fact icon={Layers} label="Temporadas" value={item.seasons} />
              <Fact icon={Clock} label="Duração" value={item.runtime ? `${item.runtime} min` : null} />
              <Fact icon={Radio} label="Status" value={statusPt(item.status)} />
              <Fact icon={Mic2} label="Estúdio" value={item.studio} />
            </div>
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="mt-5 flex flex-wrap items-center gap-2">
            {item.rating ? <Score value={item.rating} big /> : null}
            {genres.map((g) => <Chip key={g} to={exploreTo(g)}>{g}</Chip>)}
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="glass mt-5 rounded-2xl p-5">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-accent-400">Sinopse</h3>
            <p className={`text-sm leading-relaxed text-zinc-200 ${!full && long ? 'line-clamp-5' : ''}`}>{item.overview || 'Sem sinopse disponível.'}</p>
            {long && <button onClick={() => setFull(!full)} className="mt-2 text-xs font-semibold text-accent-400 hover:underline">{full ? 'Mostrar menos' : 'Ler mais'}</button>}
          </motion.div>
        </motion.div>
      </div>
      <CastSection directors={data.directors ?? []} cast={data.cast ?? []} />
      {seasons.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 flex items-center gap-2 font-display text-2xl font-semibold tracking-wide"><Tv size={20} className="text-accent-400" />Temporadas</h2>
          <div className="mb-4 flex flex-wrap gap-2">
            {seasons.map((s) => (
              <button key={s.number} onClick={() => setSeason(season === s.number ? null : s.number)} className="relative rounded-full border border-line px-4 py-1.5 text-sm font-semibold transition hover:border-accent-500/60">
                {season === s.number && <motion.span layoutId="season-pill" className="absolute inset-0 rounded-full bg-accent-600" />}
                <span className="relative">T{s.number} <span className="text-xs opacity-70">({s.episodeCount})</span></span>
              </button>
            ))}
          </div>
          {season != null && (eps.loading ? <Spinner /> : (
            <motion.ul initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.03 } } }} className="grid gap-2 md:grid-cols-2">
              {eps.data?.map((e) => (
                <motion.li key={e.number} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }} className="glass flex gap-3 rounded-xl p-3">
                  {e.stillUrl && <img src={e.stillUrl} alt="" className="h-16 w-28 shrink-0 rounded-lg object-cover" loading="lazy" />}
                  <div className="min-w-0 text-sm"><b className="text-accent-400">{e.number}.</b> {e.name} <span className="text-xs text-zinc-500">{e.airDate}</span>
                    <p className="line-clamp-2 text-xs text-zinc-400">{e.overview}</p></div>
                </motion.li>
              ))}
            </motion.ul>
          ))}
        </section>
      )}
      <ReleaseSearch d={data} />
    </div>
  )
}
