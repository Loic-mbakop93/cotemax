import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchMatchesForDate,
  fetchBestOddsForMatches,
  fmtOdd,
  fmtMatchTime,
  fmtMatchDate,
  getDateRange,
  getFlag,
} from '../lib/oddsApi'

// Returns the refresh interval in ms, or null if no refresh needed.
// Live: 60s. Kickoff within 2h: 5 min. Otherwise: no refresh.
function getRefreshInterval(matches) {
  const now = Date.now()
  for (const m of matches) {
    if (m.status === 'live') return INTERVAL_LIVE
    const msToKO = new Date(m.commence_time).getTime() - now
    if (msToKO > 0 && msToKO < 2 * 60 * 60 * 1000) return INTERVAL_PREMATCH
  }
  return null
}

const DATE_TABS = [
  { label: "Aujourd'hui", offset: 0 },
  { label: 'Demain',      offset: 1 },
  { label: 'J+2',         offset: 2 },
  { label: 'J+3',         offset: 3 },
  { label: 'J+4',         offset: 4 },
  { label: 'J+5',         offset: 5 },
  { label: 'J+6',         offset: 6 },
]

const INTERVAL_LIVE      = 60 * 1000      // 1 min — match in progress
const INTERVAL_PREMATCH  = 5 * 60 * 1000  // 5 min — kickoff within 2 hours

export default function Home() {
  const [activeTab,  setActiveTab]  = useState(0)
  const [matches,    setMatches]    = useState([])
  const [bestOdds,   setBestOdds]   = useState({})
  const [loading,    setLoading]    = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [error,      setError]      = useState(null)
  const timerRef = useRef(null)

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

        const interval = getRefreshInterval(ms)
        clearTimeout(timerRef.current)
        if (!cancelled && interval) timerRef.current = setTimeout(load, interval)
      } catch (err) {
        console.error(err)
        if (!cancelled) setError(err.message)
        // No auto-retry on error — user can switch tabs to reload
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true; clearTimeout(timerRef.current) }
  }, [activeTab])

  const hasLiveNow = matches.some((m) => m.status === 'live')
  const dateLabel  = fmtMatchDate(getDateRange(activeTab) + 'T12:00:00Z')

  return (
    <div className="page">
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

      {lastUpdate && !loading && (
        <div className="info-bar">
          <div className={`info-dot${hasLiveNow ? ' live' : ''}`} />
          {hasLiveNow
            ? 'Matchs en cours · mise à jour chaque minute'
            : `Cotes actualisées · ${lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
          &nbsp;&middot;&nbsp;Format décimal
        </div>
      )}

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

      {loading ? (
        <SkeletonList />
      ) : matches.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="match-list">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} best={bestOdds[match.id]} />
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
  const hasOdds  = !!best?.home
  const time     = fmtMatchTime(match.commence_time)
  const isLive   = match.status === 'live'
  const isDone   = match.status === 'finished'
  const hasScore = match.score_home != null && match.score_away != null

  return (
    <Link to={`/match/${match.id}`} className="match-card">
      <div className="match-card-header">
        <span className="match-time">
          {isLive ? '🔴 EN DIRECT' : isDone ? '✓ Terminé' : `${time} · ${fmtMatchDate(match.commence_time)}`}
        </span>
        {isLive && <span className="match-live-badge">LIVE</span>}
      </div>

      <div className="match-teams">
        <div className="team-block home">
          <span className="team-flag">{getFlag(match.home_team)}</span>
          <span className="team-name home">{match.home_team}</span>
        </div>

        {hasScore ? (
          <div className={`score-badge${isLive ? ' live' : ''}`}>
            <span className="score-num">{match.score_home}</span>
            <span className="score-sep">–</span>
            <span className="score-num">{match.score_away}</span>
          </div>
        ) : (
          <div className="vs-badge">VS</div>
        )}

        <div className="team-block away">
          <span className="team-name away">{match.away_team}</span>
          <span className="team-flag">{getFlag(match.away_team)}</span>
        </div>
      </div>

      {hasOdds ? (
        <div className="match-odds-strip">
          <OddsCell label="1 (Dom.)"  value={best.home} bm={best.homeBm} />
          <OddsCell label="Nul"       value={best.draw} bm={best.drawBm} />
          <OddsCell label="2 (Ext.)"  value={best.away} bm={best.awayBm} />
        </div>
      ) : (
        <div className="match-odds-strip" style={{ padding: '10px 14px' }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {isDone ? 'Match terminé' : 'Cotes non disponibles'}
          </span>
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
