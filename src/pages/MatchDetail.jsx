import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  fetchOddsForMatch,
  fetchBookmakers,
  fmtOdd,
  fmtMatchTime,
  fmtMatchDate,
} from '../lib/oddsApi'

// Bookmaker display names + affiliate URLs (fallback if DB not loaded yet)
const BM_META = {
  '1xbet':      { name: '1xBet',      url: 'https://1xbet.cm' },
  betway:       { name: 'Betway',      url: 'https://betway.cm' },
  bet365:       { name: 'Bet365',      url: 'https://bet365.cm' },
  melbet:       { name: 'Melbet',      url: 'https://melbet.cm' },
  paripesa:     { name: 'Paripesa',    url: 'https://paripesa.cm' },
  betpawa:      { name: 'betPawa',     url: 'https://betpawa.cm' },
  betwinner:    { name: 'BetWinner',   url: 'https://betwinner.cm' },
  premierbet:   { name: 'premierBet',  url: 'https://premierbet.cm' },
  linebet:      { name: 'Linebet',     url: 'https://linebet.cm' },
  betandyou:    { name: 'Betandyou',   url: 'https://betandyou.cm' },
  megapari:     { name: 'Megapari',    url: 'https://megapari.cm' },
}

export default function MatchDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [match,       setMatch]       = useState(null)
  const [rows,        setRows]        = useState([])
  const [bookmakers,  setBookmakers]  = useState({})
  const [loading,     setLoading]     = useState(true)
  const [sortKey,     setSortKey]     = useState('home') // 'home' | 'draw' | 'away'

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        // Fetch match info + odds in parallel
        const [oddsData, bms] = await Promise.all([
          fetchOddsForMatch(id),
          fetchBookmakers(),
        ])

        if (oddsData.length > 0) {
          setMatch({
            home_team:     oddsData[0].home_team,
            away_team:     oddsData[0].away_team,
            commence_time: oddsData[0].commence_time,
            status:        oddsData[0].status,
          })
          setRows(oddsData)
        } else {
          // Try fetching match info directly
          const { data } = await supabase.from('matches').select('*').eq('id', id).single()
          setMatch(data)
          setRows([])
        }

        // Build bookmaker map from DB (key → { name, affiliate_url })
        const bmMap = {}
        for (const bm of bms) bmMap[bm.key] = bm
        setBookmakers(bmMap)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
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

  // Compute best odds
  const best = { home: 0, draw: 0, away: 0 }
  for (const r of rows) {
    if (r.h2h_home > best.home) best.home = r.h2h_home
    if (r.h2h_draw > best.draw) best.draw = r.h2h_draw
    if (r.h2h_away > best.away) best.away = r.h2h_away
  }

  // Sort rows by selected column desc
  const sorted = [...rows].sort((a, b) => {
    const va = a[`h2h_${sortKey}`] ?? 0
    const vb = b[`h2h_${sortKey}`] ?? 0
    return vb - va
  })

  const getBmInfo = (key) => bookmakers[key] ?? BM_META[key] ?? { name: key, url: '#' }

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}>← Tous les matchs</button>

      {/* Match hero */}
      <div className="match-hero">
        <div className="match-hero-time">
          {fmtMatchDate(match.commence_time)} · {fmtMatchTime(match.commence_time)}
          {match.status === 'live' && (
            <span className="match-live-badge" style={{ marginLeft: 8 }}>EN DIRECT</span>
          )}
        </div>
        <div className="match-hero-teams">
          <div className="hero-team home">{match.home_team}</div>
          <div className="hero-vs">VS</div>
          <div className="hero-team away">{match.away_team}</div>
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
          {/* Best odds summary banner */}
          <div className="best-summary">
            <BestCell
              label={`1 – ${match.home_team}`}
              value={best.home}
              bm={getBmInfo(rows.find(r => r.h2h_home === best.home)?.bookmaker_key ?? '').name}
            />
            <BestCell
              label="Nul"
              value={best.draw}
              bm={getBmInfo(rows.find(r => r.h2h_draw === best.draw)?.bookmaker_key ?? '').name}
            />
            <BestCell
              label={`2 – ${match.away_team}`}
              value={best.away}
              bm={getBmInfo(rows.find(r => r.h2h_away === best.away)?.bookmaker_key ?? '').name}
            />
          </div>

          {/* Sort tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'center', marginRight: 4 }}>Trier par :</span>
            {[
              { key: 'home', label: '1 Domicile' },
              { key: 'draw', label: 'Nul' },
              { key: 'away', label: '2 Extérieur' },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setSortKey(s.key)}
                style={{
                  padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                  border: '1px solid var(--border)',
                  background: sortKey === s.key ? 'var(--yellow-500)' : 'var(--surface)',
                  color: sortKey === s.key ? '#0a1f10' : 'var(--text-2)',
                  cursor: 'pointer', fontFamily: 'var(--font)',
                }}
              >
                {s.label}
              </button>
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

          {/* Bookmaker rows */}
          <div className="bookmaker-list">
            {sorted.map((row) => {
              const bm = getBmInfo(row.bookmaker_key)
              return (
                <div key={row.bookmaker_key} className="bookmaker-row">
                  <div>
                    <div className="bookmaker-name">{bm.name}</div>
                  </div>
                  <OddPill value={row.h2h_home} isBest={row.h2h_home === best.home} />
                  <OddPill value={row.h2h_draw} isBest={row.h2h_draw === best.draw} />
                  <OddPill value={row.h2h_away} isBest={row.h2h_away === best.away} />
                  <a
                    href={bm.affiliate_url ?? bm.url ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="parier-btn"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Parier →
                  </a>
                </div>
              )
            })}
          </div>

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
  return (
    <div className={`odd-pill${isBest ? ' best-val' : ''}`}>
      {fmtOdd(value)}
    </div>
  )
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
