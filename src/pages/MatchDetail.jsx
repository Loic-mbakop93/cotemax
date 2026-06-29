import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  fetchOddsForMatch,
  fetchBookmakers,
  fmtOdd,
  fmtMatchTime,
  fmtMatchDate,
  getFlag,
} from '../lib/oddsApi'

const PRIORITY_KEYS = new Set([
  '1xbet', 'onexbet', 'betway', 'bet365', 'melbet', 'paripesa',
  'betpawa', 'betwinner', 'premierbet', 'linebet', 'betandyou', 'megapari',
])

const BM_META = {
  '1xbet':      { name: '1xBet',        url: 'https://1xbet.cm' },
  onexbet:      { name: '1xBet',        url: 'https://1xbet.cm' },
  betway:       { name: 'Betway',       url: 'https://betway.cm' },
  bet365:       { name: 'Bet365',       url: 'https://bet365.cm' },
  melbet:       { name: 'Melbet',       url: 'https://melbet.cm' },
  paripesa:     { name: 'Paripesa',     url: 'https://paripesa.cm' },
  betpawa:      { name: 'betPawa',      url: 'https://betpawa.cm' },
  betwinner:    { name: 'BetWinner',    url: 'https://betwinner.cm' },
  premierbet:   { name: 'premierBet',   url: 'https://premierbet.cm' },
  linebet:      { name: 'Linebet',      url: 'https://linebet.cm' },
  betandyou:    { name: 'Betandyou',    url: 'https://betandyou.cm' },
  megapari:     { name: 'Megapari',     url: 'https://megapari.cm' },
  pinnacle:     { name: 'Pinnacle',     url: 'https://pinnacle.com' },
  williamhill:  { name: 'William Hill', url: 'https://williamhill.com' },
  unibet_fr:    { name: 'Unibet',       url: 'https://unibet.com' },
  marathonbet:  { name: 'Marathonbet',  url: 'https://marathonbet.com' },
  betclic_fr:   { name: 'Betclic',      url: 'https://betclic.com' },
  winamax_fr:   { name: 'Winamax',      url: 'https://winamax.fr' },
  betsson:      { name: 'Betsson',      url: 'https://betsson.com' },
  betfair_ex_eu:{ name: 'Betfair',      url: 'https://betfair.com' },
  matchbook:    { name: 'Matchbook',    url: 'https://matchbook.com' },
  nordicbet:    { name: 'NordicBet',    url: 'https://nordicbet.com' },
  leovegas_se:  { name: 'LeoVegas',     url: 'https://leovegas.com' },
  coolbet:      { name: 'Coolbet',      url: 'https://coolbet.com' },
  tipico_de:    { name: 'Tipico',       url: 'https://tipico.com' },
}

const INTERVAL_LIVE     = 60 * 1000
const INTERVAL_PREMATCH = 5 * 60 * 1000

export default function MatchDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [match,      setMatch]      = useState(null)
  const [rows,       setRows]       = useState([])
  const [bookmakers, setBookmakers] = useState({})
  const [loading,    setLoading]    = useState(true)
  const [sortKey,    setSortKey]    = useState('home')
  const [showOthers, setShowOthers] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [oddsData, bms] = await Promise.all([
          fetchOddsForMatch(id),
          fetchBookmakers(),
        ])

        // Also fetch the match row directly for score/status
        const { data: matchRow } = await supabase
          .from('matches').select('*').eq('id', id).single()

        if (cancelled) return

        const matchInfo = matchRow ?? (oddsData.length > 0 ? {
          home_team:     oddsData[0].home_team,
          away_team:     oddsData[0].away_team,
          commence_time: oddsData[0].commence_time,
          status:        oddsData[0].status,
          score_home:    null,
          score_away:    null,
        } : null)

        setMatch(matchInfo)
        setRows(oddsData)

        const bmMap = {}
        for (const bm of bms) bmMap[bm.key] = bm
        setBookmakers(bmMap)

        // Refresh only when live or within 2h of kickoff
        const isLive    = matchInfo?.status === 'live'
        const msToKO    = matchInfo ? new Date(matchInfo.commence_time).getTime() - Date.now() : Infinity
        const isPreMatch = msToKO > 0 && msToKO < 2 * 60 * 60 * 1000
        const interval  = isLive ? INTERVAL_LIVE : isPreMatch ? INTERVAL_PREMATCH : null
        clearTimeout(timerRef.current)
        if (!cancelled && interval) timerRef.current = setTimeout(load, interval)
      } catch (err) {
        console.error(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    setLoading(true)
    load()
    return () => { cancelled = true; clearTimeout(timerRef.current) }
  }, [id])

  if (loading) return <LoadingDetail />

  if (!match) return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}>← Retour</button>
      <div className="empty-state">
        <div className="empty-icon">🔍</div>
        <div className="empty-title">Match introuvable</div>
      </div>
    </div>
  )

  const isLive   = match.status === 'live'
  const isDone   = match.status === 'finished'
  const hasScore = match.score_home != null && match.score_away != null

  const best = { home: 0, draw: 0, away: 0 }
  for (const r of rows) {
    if (r.h2h_home > best.home) best.home = r.h2h_home
    if (r.h2h_draw > best.draw) best.draw = r.h2h_draw
    if (r.h2h_away > best.away) best.away = r.h2h_away
  }

  const getBmInfo = (key) => bookmakers[key] ?? BM_META[key] ?? { name: key, url: '#' }
  const sortFn    = (a, b) => (b[`h2h_${sortKey}`] ?? 0) - (a[`h2h_${sortKey}`] ?? 0)
  const priorityRows = [...rows].filter(r => PRIORITY_KEYS.has(r.bookmaker_key)).sort(sortFn)
  const otherRows    = [...rows].filter(r => !PRIORITY_KEYS.has(r.bookmaker_key)).sort(sortFn)

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}>← Tous les matchs</button>

      {/* Match hero */}
      <div className="match-hero">
        <div className="match-hero-time">
          {isLive ? '🔴 EN DIRECT' : isDone ? '✓ Terminé' : `${fmtMatchDate(match.commence_time)} · ${fmtMatchTime(match.commence_time)}`}
        </div>

        <div className="match-hero-teams">
          <div className="hero-team home">
            <div className="hero-flag">{getFlag(match.home_team)}</div>
            <div>{match.home_team}</div>
          </div>

          {hasScore ? (
            <div className={`score-badge large${isLive ? ' live' : ''}`}>
              <span className="score-num">{match.score_home}</span>
              <span className="score-sep">–</span>
              <span className="score-num">{match.score_away}</span>
            </div>
          ) : (
            <div className="hero-vs">VS</div>
          )}

          <div className="hero-team away">
            <div className="hero-flag">{getFlag(match.away_team)}</div>
            <div>{match.away_team}</div>
          </div>
        </div>

        <div className="match-hero-sub">Coupe du Monde FIFA 2026</div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <div className="empty-title">Cotes non disponibles</div>
          <div className="empty-desc">Les cotes pour ce match ne sont pas encore disponibles. Revenez plus tard.</div>
        </div>
      ) : (
        <>
          {/* Best odds summary */}
          <div className="best-summary">
            <BestCell label={`1 – ${match.home_team}`} value={best.home}
              bm={getBmInfo(rows.find(r => r.h2h_home === best.home)?.bookmaker_key ?? '').name} />
            <BestCell label="Nul" value={best.draw}
              bm={getBmInfo(rows.find(r => r.h2h_draw === best.draw)?.bookmaker_key ?? '').name} />
            <BestCell label={`2 – ${match.away_team}`} value={best.away}
              bm={getBmInfo(rows.find(r => r.h2h_away === best.away)?.bookmaker_key ?? '').name} />
          </div>

          {/* Sort tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'center', marginRight: 4 }}>Trier par :</span>
            {[
              { key: 'home', label: '1 Domicile' },
              { key: 'draw', label: 'Nul' },
              { key: 'away', label: '2 Extérieur' },
            ].map((s) => (
              <button key={s.key} onClick={() => setSortKey(s.key)} style={{
                padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                border: '1px solid var(--border)',
                background: sortKey === s.key ? 'var(--yellow-500)' : 'var(--surface)',
                color: sortKey === s.key ? '#0a1f10' : 'var(--text-2)',
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}>{s.label}</button>
            ))}
          </div>

          {/* Column headers */}
          <div className="odds-columns-header">
            <div className="col-header">Bookmaker</div>
            <div className="col-header center">1</div>
            <div className="col-header center">Nul</div>
            <div className="col-header center">2</div>
            <div className="col-header center">Parier</div>
          </div>

          <div className="bookmaker-list">
            {priorityRows.length > 0 ? priorityRows.map((row) => (
              <BookmakerRow key={row.bookmaker_key} row={row} best={best} bm={getBmInfo(row.bookmaker_key)} />
            )) : rows.sort(sortFn).map((row) => (
              <BookmakerRow key={row.bookmaker_key} row={row} best={best} bm={getBmInfo(row.bookmaker_key)} />
            ))}
          </div>

          {priorityRows.length > 0 && otherRows.length > 0 && (
            <>
              <button
                onClick={() => setShowOthers(v => !v)}
                style={{
                  width: '100%', marginTop: 10, padding: '11px 14px',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: showOthers ? '8px 8px 0 0' : 8,
                  color: 'var(--text-2)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'var(--font)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <span>{showOthers ? '▲' : '▼'}&nbsp;&nbsp;{showOthers ? 'Masquer' : 'Voir'} {otherRows.length} autres bookmakers internationaux</span>
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{showOthers ? 'Réduire' : 'Développer'}</span>
              </button>
              {showOthers && (
                <div className="bookmaker-list" style={{ borderTop: 'none' }}>
                  {otherRows.map((row) => (
                    <BookmakerRow key={row.bookmaker_key} row={row} best={best} bm={getBmInfo(row.bookmaker_key)} />
                  ))}
                </div>
              )}
            </>
          )}

          <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', marginTop: 14 }}>
            ⚠️ Les cotes changent fréquemment. Vérifiez sur le site du bookmaker avant de parier.
          </div>
        </>
      )}

      <div className="footer">
        Pariez de manière responsable · 18+ · © 2026 CoteMax
      </div>
    </div>
  )
}

function BookmakerRow({ row, best, bm }) {
  return (
    <div className="bookmaker-row">
      <div className="bookmaker-name">{bm.name}</div>
      <OddPill value={row.h2h_home} isBest={row.h2h_home === best.home} />
      <OddPill value={row.h2h_draw} isBest={row.h2h_draw === best.draw} />
      <OddPill value={row.h2h_away} isBest={row.h2h_away === best.away} />
      <a
        href={bm.affiliate_url ?? bm.url ?? '#'}
        target="_blank" rel="noopener noreferrer"
        className="parier-btn"
        onClick={(e) => e.stopPropagation()}
      >
        Parier →
      </a>
    </div>
  )
}

function BestCell({ label, value, bm }) {
  return (
    <div className="best-cell">
      <div className="best-cell-label">{label}</div>
      <div className="best-cell-value">{fmtOdd(value)}</div>
      <div className="best-cell-bm">{bm}</div>
    </div>
  )
}

function OddPill({ value, isBest }) {
  if (!value) return <div className="odd-pill null-val">–</div>
  return <div className={`odd-pill${isBest ? ' best-val' : ''}`}>{fmtOdd(value)}</div>
}

function LoadingDetail() {
  return (
    <div className="page">
      <div style={{ height: 20, width: 100, marginBottom: 16 }} className="skeleton" />
      <div style={{ height: 120, borderRadius: 16, marginBottom: 20 }} className="skeleton" />
      <div style={{ height: 80, borderRadius: 12, marginBottom: 16 }} className="skeleton" />
      {[1,2,3,4,5].map(i => (
        <div key={i} style={{ height: 52, borderRadius: 8, marginBottom: 4 }} className="skeleton" />
      ))}
    </div>
  )
}
