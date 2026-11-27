import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ListChecks, Pause, Play } from 'lucide-react'
import { api, fmtBytes, fmtEta, kindLabel } from '../api'
import { Bar, btn, btnGhost, PageTitle } from '../components/ui'
import { useToast } from '../components/Toast'
import { useDownloads } from '../components/DownloadsProvider'
import { useEpisodePicker } from '../components/EpisodePicker'

const statusLabel: Record<string, string> = {
  QUEUED: 'Aguardando', SELECTING: 'Escolha os episódios', DOWNLOADING: 'Baixando', PAUSED: 'Pausado', COMPLETED: 'Concluído', ERROR: 'Erro',
}


export default function Downloads() {
  const list = useDownloads()
  const toast = useToast()
  // o seletor abre sozinho (em qualquer tela) quando um download espera a escolha dos episódios
  const setPicker = useEpisodePicker()

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
                {(d.status === 'SELECTING' || ((d.status === 'QUEUED' || d.status === 'DOWNLOADING' || d.status === 'PAUSED' || d.status === 'COMPLETED') && d.kind !== 'MOVIE')) && (
                  <button className={d.status === 'SELECTING' ? btn : btnGhost} onClick={() => setPicker(d)}><ListChecks size={14} />
                    {d.status === 'COMPLETED' ? 'Adicionar episódios' : 'Escolher episódios'}</button>)}
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
    </div>
  )
}
