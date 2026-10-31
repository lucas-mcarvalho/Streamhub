import { useSearchParams } from 'react-router-dom'
import { api, type Section } from '../api'
import { PageTitle, Row } from '../components/ui'
import { useAsync } from '../hooks'

export default function SearchPage() {
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''
  const { data, loading } = useAsync(() => api<Section[]>('/catalog/search?q=' + encodeURIComponent(q)), [q])
  return (
    <div>
      <PageTitle sub="Filmes, séries e animes">Resultados para "{q}"</PageTitle>
      {(loading ? [null, null, null] : data ?? []).map((s, i) => <Row key={s?.key ?? i} title={s?.title ?? '…'} items={s?.items ?? []} error={s?.error} loading={loading} />)}
    </div>
  )
}
