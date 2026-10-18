import { useState, type ReactNode } from 'react'

type Props = {
  title: string
  count?: number
  children?: ReactNode
}

// Component names pair up as markup even though they are not in the HTML list.
export default function Badge({ title, count = 0, children }: Props) {
  const [active, setActive] = useState(false)
  return (
    <div className={`badge ${active ? 'on' : 'off'}`} title={title}>
      <span className="badge-label">{children ?? 'n/a'}</span>
      {count > 0 ? <em data-testid="count">{count}</em> : null}
      <button onClick={() => setActive((v) => !v)} disabled={count <= 0}>
        toggle
      </button>
    </div>
  )
}
