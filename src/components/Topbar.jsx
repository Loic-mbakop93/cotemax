import { Link } from 'react-router-dom'

export default function Topbar() {
  return (
    <header className="topbar">
      <Link to="/" className="topbar-logo" style={{ textDecoration: 'none' }}>
        <div className="topbar-logo-icon">⚽</div>
        <span>CoteMax</span>
      </Link>
      <div className="topbar-right">
        <span className="topbar-badge">🌍 CM 2026</span>
        <span className="topbar-badge">XAF</span>
      </div>
    </header>
  )
}
