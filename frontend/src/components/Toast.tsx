import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Toast = { id: number; text: string; kind: 'ok' | 'err' }
const Ctx = createContext<(text: string, kind?: 'ok' | 'err') => void>(() => {})
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const push = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((i) => [...i, { id, text, kind }])
    setTimeout(() => setItems((i) => i.filter((t) => t.id !== id)), 5000)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={`max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg ${t.kind === 'ok' ? 'bg-emerald-700' : 'bg-red-700'}`}>{t.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
