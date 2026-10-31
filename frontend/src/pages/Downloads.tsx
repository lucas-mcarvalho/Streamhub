import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ListChecks, Pause, Play } from 'lucide-react'
import { api, authHeaders, fmtBytes, fmtEta, kindLabel, type Download, type DownloadFile } from '../api'
import { Bar, btn, btnGhost, input, Modal, PageTitle, Spinner } from '../components/ui'
import { useToast } from '../components/Toast'

const statusLabel: Record<string, string> = {
  QUEUED: 'Aguardando', SELECTING: 'Escolha os episódios', DOWNLOADING: 'Baixando', PAUSED: 'Pausado', COMPLETED: 'Concluído', ERROR: 'Erro',
}

/** Lê o stream SSE com fetch para poder enviar o cabeçalho Authorization (EventSource não permite). */
function useDownloadsStream(onData: (d: Download[]) => void) {
  useEffect(() => {
    const ctrl = new AbortController()
    let stopped = false
    const loop = async () => {
      while (!stopped) {
        try {
          const res = await fetch('/api/downloads/stream', { headers: authHeaders(), signal: ctrl.signal })
          if (!res.body) throw new Error('sem corpo')
          const reader = res.body.getReader()
          const dec = new TextDecoder()
          let buf = ''
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buf += dec.decode(value, { stream: true })
            let i
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const block = buf.slice(0, i)
              buf = buf.slice(i + 2)
              const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('')
              if (data) onData(JSON.parse(data))
            }
          }
        } catch { /* reconecta abaixo */ }
        if (!stopped) await new Promise((r) => setTimeout(r, 3000))
      }
    }
    loop()
    return () => { stopped = true; ctrl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

function FilePicker({ d, onClose }: { d: Download; onClose: () => void }) {
  const toast = useToast()
  const [files, setFiles] = useState<DownloadFile[] | null>(null)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let dead = false
    const load = () => api<DownloadFile[]>(`/downloads/${d.id}/files`)
      .then((f) => { if (dead) return; setFiles(f); setSel(new Set(d.status === 'SELECTING' ? [] : f.filter((x) => x.selected).map((x) => x.index))) })
      .catch(() => { if (!dead) setTimeout(load, 2000) })
    load()
    return () => { dead = true }
  }, [d.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = files?.filter((f) => f.name.toLowerCase().includes(filter.toLowerCase())) ?? []
  const total = files?.filter((f) => sel.has(f.index)).reduce((a, f) => a + f.size, 0) ?? 0
  const toggle = (i: number) => setSel((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })
  const setMany = (idx: number[], on: boolean) => setSel((s) => { const n = new Set(s); idx.forEach((i) => (on ? n.add(i) : n.delete(i))); return n })

  const confirm = async () => {
    setBusy(true)
    try { await api(`/downloads/${d.id}/files`, { method: 'POST', json: { selected: [...sel] } }); toast('Download iniciado com os arquivos escolhidos'); onClose() }
    catch (e) { toast((e as Error).message, 'err') } finally { setBusy(false) }
  }

  return (
    <Modal title="Escolha os episódios" onClose={onClose} wide>
      <p className="mb-3 truncate text-xs text-zinc-400">{d.title}</p>
      {!files ? <Spinner /> : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input className={input + ' max-w-xs'} placeholder="Filtrar (ex.: E05, 1080p)…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button className={btnGhost} onClick={() => setMany(shown.map((f) => f.index), true)}>Marcar {filter ? 'filtrados' : 'todos'}</button>
            <button className={btnGhost} onClick={() => setMany(shown.map((f) => f.index), false)}>Desmarcar {filter ? 'filtrados' : 'todos'}</button>
          </div>
          <ul className="mb-4 max-h-[50vh] space-y-1 overflow-auto pr-1">
            {shown.map((f) => (
              <li key={f.index}>
                <label className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-surface2 ${sel.has(f.index) ? 'bg-accent-500/10' : ''}`}>
                  <input type="checkbox" className="accent-accent-500" checked={sel.has(f.index)} onChange={() => toggle(f.index)} />
                  <span className="min-w-0 flex-1 break-all">{f.name.split('/').pop()}</span>
                  <span className="shrink-0 text-xs text-zinc-400">{fmtBytes(f.size)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-300">{sel.size} de {files.length} selecionado(s) · {fmtBytes(total)}</span>
            <button className={btn} disabled={busy || sel.size === 0} onClick={confirm}>{d.status === 'SELECTING' ? 'Baixar selecionados' : 'Aplicar seleção'}</button>
          </div>
          {d.status !== 'SELECTING' && <p className="mt-2 text-xs text-zinc-500">Arquivos desmarcados deixam de ser baixados; o que já foi baixado é mantido.</p>}
        </>
      )}
    </Modal>
  )
}

export default function Downloads() {
  const [list, setList] = useState<Download[] | null>(null)
  const toast = useToast()
  const [picker, setPicker] = useState<Download | null>(null)
  const prompted = useRef<Set<number>>(new Set())
  useDownloadsStream(setList)

  // abre o seletor sozinho quando um download fica pronto para a escolha dos episódios
  useEffect(() => {
    const d = list?.find((x) => x.status === 'SELECTING' && !prompted.current.has(x.id))
    if (d) { prompted.current.add(d.id); setPicker(d) }
  }, [list])

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn() } catch (e) { toast((e as Error).message, 'err') }
  }

  return (
    <div>
      <PageTitle sub="Acompanhamento em tempo real">Downloads</PageTitle>
      {list === null && <p className="text-sm text-zinc-500">Conectando…</p>}
      {list?.length === 0 && <p className="text-sm text-zinc-500">Nenhum download.</p>}
      <div className="space-y-3">
        <AnimatePresence>
        {list?.map((d) => (
          <motion.div key={d.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -40 }} className="glass rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{d.title}</div>
                <div className="text-xs text-zinc-400">{kindLabel[d.kind]} · {d.destination}</div>
              </div>
              <span className={`rounded px-2 py-0.5 text-xs ${d.status === 'ERROR' ? 'bg-red-800' : d.status === 'COMPLETED' ? 'bg-emerald-800' : 'bg-zinc-700'}`}>{statusLabel[d.status]}</span>
            </div>
            <div className="my-3"><Bar percent={d.progress * 100} /></div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
              <span>{(d.progress * 100).toFixed(1)}% · {fmtBytes(d.downloadedBytes)} / {fmtBytes(d.sizeBytes)} em disco</span>
              <span>↓ {(d.dlSpeed / 1048576).toFixed(2)} MB/s · ↑ {(d.upSpeed / 1048576).toFixed(2)} MB/s · ETA {d.status === 'DOWNLOADING' ? fmtEta(d.etaSeconds) : '—'}</span>
              <span className="flex gap-2">
                {d.status === 'COMPLETED' && <Link to={`/library?q=${encodeURIComponent(d.title.split(/[.\s]S\d/)[0].replace(/\./g, ' '))}`} className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-semibold"><Play size={14} fill="white" />Assistir</Link>}
                {(d.status === 'SELECTING' || d.status === 'DOWNLOADING' || d.status === 'PAUSED') && <button className={d.status === 'SELECTING' ? btn : btnGhost} onClick={() => setPicker(d)}><ListChecks size={14} />Episódios</button>}
                {d.status === 'DOWNLOADING' && <button className={btnGhost} onClick={() => act(() => api(`/downloads/${d.id}/pause`, { method: 'POST' }))}><Pause size={14} />Pausar</button>}
                {d.status === 'PAUSED' && <button className={btnGhost} onClick={() => act(() => api(`/downloads/${d.id}/resume`, { method: 'POST' }))}><Play size={14} />Retomar</button>}
                <button className={btnGhost} onClick={() => { if (confirm('Cancelar e remover da lista? (os arquivos são mantidos)')) act(() => api(`/downloads/${d.id}`, { method: 'DELETE' })) }}>
                  {d.status === 'COMPLETED' ? 'Remover' : 'Cancelar'}</button>
                <button className={btnGhost} onClick={() => { if (confirm('Remover da lista e APAGAR os arquivos baixados?')) act(() => api(`/downloads/${d.id}?deleteFiles=true`, { method: 'DELETE' })) }}>{d.status === 'COMPLETED' ? 'Remover e apagar' : 'Cancelar e apagar'}</button>
              </span>
            </div>
            {d.errorMessage && <p className="mt-2 text-xs text-red-400">{d.errorMessage}</p>}
          </motion.div>
        ))}
        </AnimatePresence>
      </div>
      {picker && <FilePicker d={picker} onClose={() => setPicker(null)} />}
    </div>
  )
}
