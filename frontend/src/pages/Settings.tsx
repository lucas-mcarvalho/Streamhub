import { useEffect, useState } from 'react'
import { api, type Indexer, type Integration } from '../api'
import { btn, btnGhost, input, Modal, Notice, PageTitle, Spinner } from '../components/ui'
import { useToast } from '../components/Toast'
import { useAsync } from '../hooks'

type Schema = { definitionName: string; name: string; privacy: string; protocol: string; fields: { name: string; label: string; type: string; privacy: string }[] }

function IntegrationRow({ it, onSaved }: { it: Integration; onSaved: () => void }) {
  const toast = useToast()
  const [url, setUrl] = useState(it.baseUrl ?? '')
  const [user, setUser] = useState(it.username ?? '')
  const [secret, setSecret] = useState('')
  const isTmdb = it.service === 'tmdb'
  const isQbit = it.service === 'qbittorrent'
  const save = async () => {
    try { await api(`/integrations/${it.service}`, { method: 'PUT', json: { baseUrl: url, username: user, secret, enabled: true } }); toast('Salvo'); setSecret(''); onSaved() }
    catch (e) { toast((e as Error).message, 'err') }
  }
  const test = async () => {
    const r = await api<{ ok: boolean; message: string }>(`/integrations/${it.service}/test`, { method: 'POST' })
    toast(`${it.label}: ${r.message}`, r.ok ? 'ok' : 'err')
  }
  return (
    <div className="rounded-lg bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">{it.label}</span>
        <span className={`text-xs ${it.configured ? 'text-emerald-400' : 'text-zinc-500'}`}>{it.configured ? `configurado (${it.source})` : 'não configurado'}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        {!isTmdb && <input className={input} placeholder="URL (ex.: http://prowlarr:9696)" value={url} onChange={(e) => setUrl(e.target.value)} />}
        {isQbit && <input className={input} placeholder="Usuário" value={user} onChange={(e) => setUser(e.target.value)} />}
        <input className={input} type="password" placeholder={it.hasSecret ? '•••••• (deixe vazio para manter)' : isQbit ? 'Senha' : 'Chave de API'} value={secret} onChange={(e) => setSecret(e.target.value)} />
        <div className="flex gap-2"><button className={btn} onClick={save}>Salvar</button><button className={btnGhost} onClick={test}>Testar</button></div>
      </div>
    </div>
  )
}

function AddIndexer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const schema = useAsync(() => api<Schema[]>('/indexers/schema'), [])
  const [filter, setFilter] = useState('')
  const [sel, setSel] = useState<Schema | null>(null)
  const [vals, setVals] = useState<Record<string, string>>({})
  const add = async () => {
    try { await api('/indexers', { method: 'POST', json: { definitionName: sel!.definitionName, name: sel!.name, fields: vals } }); toast('Indexador adicionado'); onDone() }
    catch (e) { toast((e as Error).message, 'err') }
  }
  const editable = sel?.fields.filter((f) => ['textbox', 'password'].includes(f.type) && !f.name.startsWith('definitionFile') && !f.name.includes('.')) ?? []
  return (
    <Modal title="Adicionar indexador" onClose={onClose}>
      {!sel ? (
        <>
          <input className={input + ' mb-2'} placeholder="Filtrar…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {schema.loading ? <Spinner /> : schema.error ? <Notice text={schema.error} /> : (
            <ul className="max-h-72 overflow-auto text-sm">
              {schema.data?.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 100).map((s) => (
                <li key={s.definitionName} className="cursor-pointer px-2 py-1.5 hover:bg-surface2" onClick={() => setSel(s)}>{s.name} <span className="text-xs text-zinc-500">{s.privacy} · {s.protocol}</span></li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="mb-2 font-medium">{sel.name} <span className="text-xs text-zinc-500">{sel.privacy}</span></p>
          {editable.length === 0 && <p className="mb-3 text-sm text-zinc-400">Este indexador não precisa de configuração. Basta adicionar.</p>}
          {editable.map((f) => (
            <input key={f.name} className={input + ' mb-2'} type={f.type === 'password' ? 'password' : 'text'} placeholder={f.label} value={vals[f.name] ?? ''} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} />
          ))}
          <div className="flex gap-2"><button className={btn} onClick={add}>Adicionar</button><button className={btnGhost} onClick={() => setSel(null)}>Voltar</button></div>
        </>
      )}
    </Modal>
  )
}

type Limits = { maxListMb: number; minMb: number; maxMb: number; defaultMb: number }

function ChannelSettings() {
  const toast = useToast()
  const { data, reload } = useAsync(() => api<Limits>('/channels/settings'), [])
  const [mb, setMb] = useState(48)
  useEffect(() => { if (data) setMb(data.maxListMb) }, [data])
  if (!data) return null
  const dirty = mb !== data.maxListMb
  const save = async () => {
    try { await api('/channels/settings', { method: 'PUT', json: { maxListMb: mb } }); toast(`Limite ajustado para ${mb} MB`); reload() }
    catch (e) { toast((e as Error).message, 'err') }
  }
  return (
    <div className="mb-8">
      <h2 className="mb-2 text-lg font-semibold">TV ao vivo</h2>
      <div className="glass rounded-2xl p-4">
        <label className="mb-1 block text-sm font-medium">Tamanho máximo de cada lista de canais (M3U)</label>
        <p className="mb-3 text-xs text-zinc-400">
          Listas maiores que o limite são recusadas com "Lista grande demais". O servidor carrega a lista inteira na memória para analisá-la,
          então valores altos aumentam o uso de memória e deixam a abertura da lista mais lenta. As listas de teste mais comuns têm de 20 KB a 10 MB.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <input type="range" min={data.minMb} max={data.maxMb} step={1} value={mb} onChange={(e) => setMb(Number(e.target.value))} className="min-w-[200px] flex-1 accent-accent-500" />
          <div className="flex items-center gap-2">
            <input type="number" min={data.minMb} max={data.maxMb} value={mb} onChange={(e) => setMb(Math.max(data.minMb, Math.min(data.maxMb, Number(e.target.value) || data.minMb)))} className={input + ' !w-24'} />
            <span className="text-sm text-zinc-400">MB</span>
          </div>
          <button className={btn} disabled={!dirty} onClick={save}>Salvar</button>
          <button className={btnGhost} disabled={mb === data.defaultMb} onClick={() => setMb(data.defaultMb)}>Padrão ({data.defaultMb} MB)</button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Faixa permitida: {data.minMb} a {data.maxMb} MB. A mudança vale na hora, sem reiniciar.</p>
      </div>
    </div>
  )
}

export default function Settings() {
  const toast = useToast()
  const ints = useAsync(() => api<Integration[]>('/integrations'), [])
  const idx = useAsync(() => api<Indexer[]>('/indexers'), [])
  const [adding, setAdding] = useState(false)
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast(ok); idx.reload() } catch (e) { toast((e as Error).message, 'err') }
  }
  return (
    <div>
      <PageTitle sub="Integrações e indexadores">Configurações</PageTitle>
      <h2 className="mb-2 text-lg font-semibold">Integrações</h2>
      <p className="mb-3 text-sm text-zinc-400">Credenciais são guardadas cifradas no banco. Chaves do Prowlarr/Sonarr/Radarr são lidas automaticamente do config.xml quando disponível.</p>
      <div className="mb-8 space-y-3">{ints.loading ? <Spinner /> : ints.data?.map((i) => <IntegrationRow key={i.service} it={i} onSaved={ints.reload} />)}</div>

      <ChannelSettings />

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Indexadores (Prowlarr)</h2>
        <button className={btn} onClick={() => setAdding(true)}>+ Adicionar</button>
      </div>
      {idx.error && <Notice text={idx.error} />}
      {idx.data?.length === 0 && <p className="text-sm text-zinc-500">Nenhum indexador cadastrado.</p>}
      <div className="space-y-2">
        {idx.data?.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface p-3">
            <div>
              <span className="font-medium">{i.name}</span>
              <span className="ml-2 text-xs text-zinc-500">{i.privacy} · {i.protocol}</span>
              <span className={`ml-2 text-xs ${i.failing ? 'text-red-400' : 'text-emerald-400'}`}>{i.failing ? 'com falhas' : 'ok'}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={i.enabled} onChange={(e) => act(() => api(`/indexers/${i.id}/enabled`, { method: 'PUT', json: { enabled: e.target.checked } }))} /> Ativo</label>
              <button className={btnGhost} onClick={async () => { const r = await api<{ ok: boolean; message: string }>(`/indexers/${i.id}/test`, { method: 'POST' }); toast(`${i.name}: ${r.message}`, r.ok ? 'ok' : 'err') }}>Testar</button>
              <button className={btnGhost} onClick={() => confirm(`Remover ${i.name}?`) && act(() => api(`/indexers/${i.id}`, { method: 'DELETE' }), 'Removido')}>Remover</button>
            </div>
          </div>
        ))}
      </div>
      {adding && <AddIndexer onClose={() => setAdding(false)} onDone={() => { setAdding(false); idx.reload() }} />}
    </div>
  )
}
