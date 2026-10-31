import { useState } from 'react'
import { api, type Indexer, type Integration } from '../api'
import { btn, btnGhost, input, Modal, Notice, Spinner } from '../components/ui'
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
    <div className="rounded-lg bg-zinc-900 p-4">
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
                <li key={s.definitionName} className="cursor-pointer px-2 py-1.5 hover:bg-zinc-800" onClick={() => setSel(s)}>{s.name} <span className="text-xs text-zinc-500">{s.privacy} · {s.protocol}</span></li>
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
      <h1 className="mb-4 text-2xl font-bold">Configurações</h1>
      <h2 className="mb-2 text-lg font-semibold">Integrações</h2>
      <p className="mb-3 text-sm text-zinc-400">Credenciais são guardadas cifradas no banco. Chaves do Prowlarr/Sonarr/Radarr são lidas automaticamente do config.xml quando disponível.</p>
      <div className="mb-8 space-y-3">{ints.loading ? <Spinner /> : ints.data?.map((i) => <IntegrationRow key={i.service} it={i} onSaved={ints.reload} />)}</div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Indexadores (Prowlarr)</h2>
        <button className={btn} onClick={() => setAdding(true)}>+ Adicionar</button>
      </div>
      {idx.error && <Notice text={idx.error} />}
      {idx.data?.length === 0 && <p className="text-sm text-zinc-500">Nenhum indexador cadastrado.</p>}
      <div className="space-y-2">
        {idx.data?.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-900 p-3">
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
