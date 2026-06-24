import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchMatchesForDate,
  fetchBestOddsForMatches,
  fmtOdd,
  fmtMatchTime,
  fmtMatchDate,
  getDateRange,
} from '../lib/oddsApi'

const DATE_TABS = [
  { label: "Aujourd'hui", offset: 0 },
  { label: 'Demain',      offset: 1 },
  { label: 'J+2',         offset: 2 },
  { label: 'J+3',         offset: 3 },
  { label: 'J+4',         offset: 4 },
  { label: 'J+5',         offset: 5 },
  { label: 'J+6',         offset: 6 },
]

export default function Home() {
  const [activeTab, setActiveTab] = useState(0)
  const [matches,   setMatches]   = useState([])
  const [bestOdds,  setBestOdds]  = useState({})
  const [loading,   setLoading]   = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [error,     setError]     = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const dateStr = getDateRange(activeTab)
        const ms = await fetchMatchesForDate(dateStr)
        if (cancelled) return
        setMatches(ms)
        if (ms.length) {
          const ids = ms.map((m) => m.id)
          const bo  = await fetchBestOddsForMatches(ids)
          if (!cancelled) setBestOdds(bo)
        } else {
          setBestOdds({})
        }
        setLastUpdate(new Date())
      } catch (err) {
        console.error(err)
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()

    // Refresh every 5 minutes
    const timer = setInterval(load, 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [activeTab])

  const dateLabel = fmtMatchDate(getDateRange(activeTab) + 'T12:00:00Z')

  return (
    <div className="page">
      {/* Date tabs */}
      <div className="date-tabs">
        {DATE_TABS.map((tab, i) => (
          <button
            key={i}
            className={`date-tab${activeTab === i ? ' active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Info bar */}
      {lastUpdate && !loading && (
        <div className="info-bar">
          <div className="info-dot" />
          Cotes actualisées • {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          &nbsp;&middot;&nbsp;Format décimal
        </div>
      )}

      {/* Section header */}
      <div className="section-header">
        <div className="section-title">
          {activeTab === 0 ? "Matchs d'aujourd'hui" : `Matchs du ${dateLabel}`}
        </div>
        <div className="section-sub">Coupe du Monde 2026 · Meilleures cotes surlignées</div>
      </div>

      {error && (
        <div style={{ background: '#2a0a0a', border: '1px solid #e53e3e', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#fc8181' }}>
          ⚠️ Erreur: {error}
        </div>
      )}

      {/* Match list */}
      {loading ? (
        <SkeletonList />
      ) : matches.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="match-list">
          {matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              best={bestOdds[match.id]}
            />
          ))}
        </div>
      )}

      <div className="footer">
        Les cotes sont indicatives et peuvent changer. Pariez de manière responsable.<br />
        © 2026 CoteMax · Yaoundé, Cameroun
      </div>
    </div>
  )
}

function MatchCard({ match, best }) {
  const hasOdds = !!best?.home
  const time = fmtMatchTime(match.commence_time)
  const isLive = match.status === 'live'

  return (
    <Link to={`/match/${match.id}`} className="match-card">
      <div className="match-card-header">
        <span className="match-time">{time} • {fmtMatchDate(match.commence_time)}</span>
        {isLive && <span className="match-live-badge">EN DIRECT</span>}
      </div>
      <div className="match-teams">
        <span className="team-name home">{match.home_team}</span>
        <span className="vs-badge">VS</span>
        <span className="team-name away">{match.away_team}</span>
      </div>
      {hasOdds ? (
        <div className="match-odds-strip">
          <OddsCell label="1 (Domicile)" value={best.home} bm={best.homeBm} />
          <OddsCell label="Nul"          value={best.draw} bm={best.drawBm} />
          <OddsCell label="2 (Extérieur)" value={best.away} bm={best.awayBm} />
        </div>
      ) : (
        <div className="match-odds-strip" style={{ padding: '10px 14px' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Cotes non disponibles</span>
        </div>
      )}
    </Link>
  )
}

function OddsCell({ label, value, bm }) {
  return (
    <div className="odds-cell">
      <div className="odds-label">{label}</div>
      <div className={`odds-value${value ? ' best' : ''}`}>{fmtOdd(value)}</div>
      {bm && <div className="odds-bookmaker">{bm}</div>}
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="match-list">
      {[1, 2, 3].map((i) => (
        <div key={i} className="skeleton skeleton-card" />
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-icon">⚽</div>
      <div className="empty-title">Aucun match ce jour</div>
      <div className="empty-desc">
        Aucun match de la Coupe du Monde n'est prévu pour cette date.<br />
        Choisissez un autre jour ci-dessus.
      </div>
    </div>
  )
}
