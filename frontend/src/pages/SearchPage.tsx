import { useSearchParams } from 'react-router-dom'
import { api, type Section } from '../api'
import { Row, Spinner } from '../components/ui'
import { useAsync } from '../hooks'

export default function SearchPage() {
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''
  const { data, loading } = useAsync(() => api<Section[]>('/catalog/search?q=' + encodeURIComponent(q)), [q])
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Resultados para "{q}"</h1>
      {loading ? <Spinner /> : data?.map((s) => <Row key={s.key} title={s.title} items={s.items} error={s.error} />)}
    </div>
  )
}
