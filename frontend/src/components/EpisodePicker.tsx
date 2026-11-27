import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { CheckCircle2, Download as DownloadIcon, Search } from 'lucide-react'
import { api, fmtBytes, type Download, type DownloadFile } from '../api'
import { btn, btnGhost, input, Modal, Spinner } from './ui'
import { useToast } from './Toast'
import { useDownloads } from './DownloadsProvider'
import { flyToDownloads } from './DownloadFly'

const VIDEO = /\.(mkv|mp4|m4v|avi|mov|webm|ts|wmv)$/i
const SXXEYY = /[Ss](\d{1,2})[Ee](\d{1,4})|(\d{1,2})x(\d{2,4})/
const ABSOLUTE = /\s-\s(\d{1,4})(?:v\d)?(?=[\s.[(]|$)/g

/** Temporada e episódio pelo nome do arquivo (mesmas regras da biblioteca). */
function episodeOf(name: string): { season?: number; episode?: number } {
  const base = name.split('/').pop() ?? name
  const m = base.match(SXXEYY)
  if (m) return { season: Number(m[1] ?? m[3]), episode: Number(m[2] ?? m[4]) }
  let ep: number | undefined
  for (const a of base.matchAll(ABSOLUTE)) {
    const n = Number(a[1])
    if (n > 0 && !(n >= 1900 && n <= 2099)) ep = n
  }
  return { episode: ep }
}

/** Escolha dos arquivos (episódios) de um download: antes de começar, durante ou depois de concluído. */
function EpisodePicker({ d, onClose }: { d: Download; onClose: () => void }) {
  const toast = useToast()
  const [files, setFiles] = useState<DownloadFile[] | null>(null)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState('')
  const [showOther, setShowOther] = useState(false)
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState('')
  const touched = useRef(false)
  const selecting = d.status === 'SELECTING' || d.status === 'QUEUED'

  // lista de arquivos: espera os metadados do torrent e, depois, atualiza o progresso de cada arquivo
  useEffect(() => {
    let dead = false
    let timer: ReturnType<typeof setTimeout>
    const load = (first: boolean) => api<DownloadFile[]>(`/downloads/${d.id}/files`)
      .then((f) => {
        if (dead) return
        setFiles(f); setWaiting('')
        if (first && !touched.current) {
          // antes de começar: vêm marcados os vídeos; durante/depois: o que já está marcado no qBittorrent
          setSel(new Set(d.status === 'SELECTING' ? f.filter((x) => VIDEO.test(x.name)).map((x) => x.index) : f.filter((x) => x.selected).map((x) => x.index)))
        }
        timer = setTimeout(() => load(false), 3000)
      })
      .catch((e) => { if (!dead) { setWaiting((e as Error).message); timer = setTimeout(() => load(first), 2000) } })
    load(true)
    return () => { dead = true; clearTimeout(timer) }
  }, [d.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => (files ?? []).map((f) => ({ ...f, ...episodeOf(f.name), video: VIDEO.test(f.name), short: f.name.split('/').pop() ?? f.name }))
    .sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 1e9) - (b.episode ?? 1e9) || a.short.localeCompare(b.short, undefined, { numeric: true })), [files])
  const q = filter.toLowerCase()
  const shown = rows.filter((f) => (showOther || f.video) && f.name.toLowerCase().includes(q))
  const others = rows.filter((f) => !f.video).length
  const seasons = [...new Set(shown.map((f) => f.season ?? 0))]
  const total = rows.filter((f) => sel.has(f.index)).reduce((a, f) => a + f.size, 0)
  const toggle = (i: number) => { touched.current = true; setSel((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n }) }
  const setMany = (idx: number[], on: boolean) => { touched.current = true; setSel((s) => { const n = new Set(s); idx.forEach((i) => (on ? n.add(i) : n.delete(i))); return n }) }

  const confirm = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const from = e.currentTarget.getBoundingClientRect()
    setBusy(true)
    try {
      await api(`/downloads/${d.id}/files`, { method: 'POST', json: { selected: [...sel] } })
      if (selecting || d.status === 'COMPLETED') flyToDownloads(from)
      toast(selecting ? 'Download iniciado com os episódios escolhidos' : 'Seleção de episódios atualizada')
      onClose()
    } catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  return (
    <Modal title={selecting ? 'Escolha os episódios' : 'Episódios do download'} onClose={onClose} wide>
      <p className="mb-3 truncate text-xs text-zinc-400" title={d.title}>{d.title}</p>
      {!files ? (
        <div className="py-4 text-center">
          <Spinner />
          <p className="text-xs text-zinc-500">{waiting.includes('metadados') || waiting.includes('registrou') ? 'Buscando a lista de arquivos do torrent…' : waiting || 'Carregando…'}</p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input className={input + ' !pl-8'} placeholder="Filtrar (ex.: E05, 1080p)…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
            <button className={btnGhost} onClick={() => setMany(shown.map((f) => f.index), true)}>Marcar {filter ? 'filtrados' : 'todos'}</button>
            <button className={btnGhost} onClick={() => setMany(shown.map((f) => f.index), false)}>Desmarcar {filter ? 'filtrados' : 'todos'}</button>
          </div>
          <div className="mb-4 max-h-[50vh] space-y-3 overflow-auto pr-1">
            {seasons.map((s) => {
              const group = shown.filter((f) => (f.season ?? 0) === s)
              const allOn = group.every((f) => sel.has(f.index))
              return (
                <div key={s}>
                  {seasons.length > 1 && (
                    <div className="sticky top-0 z-10 mb-1 flex items-center justify-between bg-surface/95 px-1 py-1 backdrop-blur">
                      <span className="text-xs font-bold uppercase tracking-wider text-accent-400">{s ? `Temporada ${s}` : 'Sem temporada no nome'}</span>
                      <button className="text-xs text-zinc-400 hover:text-white" onClick={() => setMany(group.map((f) => f.index), !allOn)}>{allOn ? 'Desmarcar temporada' : 'Marcar temporada'}</button>
                    </div>
                  )}
                  <ul className="space-y-1">
                    {group.map((f) => {
                      const on = sel.has(f.index)
                      const done = f.progress >= 1
                      return (
                        <li key={f.index}>
                          <label className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-surface2 ${on ? 'bg-accent-500/10' : ''} ${f.video ? '' : 'opacity-60'}`}>
                            <input type="checkbox" className="accent-accent-500" checked={on} onChange={() => toggle(f.index)} />
                            {f.episode != null && <span className="shrink-0 rounded bg-surface2 px-1.5 py-0.5 text-[11px] font-bold text-zinc-200">{f.season != null ? `T${f.season} · ` : ''}E{String(f.episode).padStart(2, '0')}</span>}
                            <span className="min-w-0 flex-1">
                              <span className="block break-all">{f.short}</span>
                              {!selecting && f.progress > 0 && !done && (
                                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-accent-500" style={{ width: `${f.progress * 100}%` }} /></span>
                              )}
                            </span>
                            {done ? <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-400"><CheckCircle2 size={14} />baixado</span>
                              : <span className="shrink-0 text-xs text-zinc-400">{!selecting && f.progress > 0 ? `${Math.floor(f.progress * 100)}% · ` : ''}{fmtBytes(f.size)}</span>}
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
            {shown.length === 0 && <p className="py-4 text-center text-sm text-zinc-500">Nenhum arquivo.</p>}
          </div>
          {others > 0 && (
            <label className="mb-3 flex items-center gap-2 text-xs text-zinc-400">
              <input type="checkbox" className="accent-accent-500" checked={showOther} onChange={(e) => setShowOther(e.target.checked)} />
              Mostrar outros arquivos ({others}: legendas, extras, textos…)
            </label>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-zinc-300">{sel.size} de {files.length} selecionado(s) · {fmtBytes(total)}</span>
            <motion.button whileTap={{ scale: 0.95 }} className={btn} disabled={busy || sel.size === 0} onClick={confirm}>
              <DownloadIcon size={16} />{selecting ? 'Baixar selecionados' : 'Aplicar seleção'}
            </motion.button>
          </div>
          {!selecting && <p className="mt-2 text-xs text-zinc-500">Desmarcados deixam de ser baixados (o que já foi baixado fica no disco); marcar mais episódios continua o download.</p>}
        </>
      )}
    </Modal>
  )
}

const Ctx = createContext<(d: Download) => void>(() => {})
/** Abre o seletor de episódios de um download sobre a tela atual. */
export const useEpisodePicker = () => useContext(Ctx)

/**
 * Seletor de episódios disponível em todas as telas. Abre sozinho quando um download fica esperando a escolha
 * (status SELECTING), sem precisar ir até a tela de Downloads.
 */
export function EpisodePickerProvider({ children }: { children: ReactNode }) {
  const list = useDownloads()
  const [open, setOpen] = useState<Download | null>(null)
  const prompted = useRef(new Set<number>())
  const watching = useLocation().pathname.startsWith('/watch')
  const show = useCallback((d: Download) => { prompted.current.add(d.id); setOpen(d) }, [])
  useEffect(() => {
    if (open || watching) return   // não interrompe quem está assistindo
    const d = list?.find((x) => x.status === 'SELECTING' && !prompted.current.has(x.id))
    if (d) show(d)
  }, [list, open, show, watching])
  // status ao vivo (ex.: SELECTING → DOWNLOADING depois de confirmar)
  const live = open ? list?.find((x) => x.id === open.id) ?? open : null
  return (
    <Ctx.Provider value={show}>
      {children}
      {live && <EpisodePicker key={live.id} d={live} onClose={() => setOpen(null)} />}
    </Ctx.Provider>
  )
}
