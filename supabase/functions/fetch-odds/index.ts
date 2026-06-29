import { createClient } from 'jsr:@supabase/supabase-js@2'

const ODDS_API_KEY   = Deno.env.get('ODDS_API_KEY')!
const SPORT_KEY      = 'soccer_fifa_world_cup'
const REGION         = 'eu'
const MARKETS        = 'h2h'
const ODDS_API_URL   = `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds/?apiKey=${ODDS_API_KEY}&regions=${REGION}&markets=${MARKETS}&oddsFormat=decimal`
const SCORES_API_URL = `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=1`

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 1. Fetch odds from The Odds API ────────────────────────────
  let apiData: OddsApiGame[]
  try {
    const resp = await fetch(ODDS_API_URL)
    if (!resp.ok) {
      const body = await resp.text()
      return jsonError(`Odds API ${resp.status}: ${body}`, 502)
    }
    apiData = await resp.json()
  } catch (err) {
    return jsonError(`Fetch failed: ${err}`, 502)
  }

  // ── 2. Fetch scores from The Odds API ──────────────────────────
  let scoresData: ScoresApiGame[] = []
  try {
    const resp = await fetch(SCORES_API_URL)
    if (resp.ok) scoresData = await resp.json()
  } catch {
    // Non-fatal — scores are a bonus
  }

  // Build a map of external_id → score info
  const scoreMap = new Map<string, { home: number | null; away: number | null; status: string }>()
  for (const g of scoresData) {
    if (!g.scores) continue
    const homeScore = g.scores.find((s) => s.name === g.home_team)
    const awayScore = g.scores.find((s) => s.name === g.away_team)
    scoreMap.set(g.id, {
      home:   homeScore ? parseInt(homeScore.score) : null,
      away:   awayScore ? parseInt(awayScore.score) : null,
      status: g.completed ? 'finished' : 'live',
    })
  }

  // ── 3. Upsert matches ───────────────────────────────────────────
  const now = new Date().toISOString()
  const matchRows = apiData.map((g) => {
    const score = scoreMap.get(g.id)
    return {
      external_id:   g.id,
      home_team:     g.home_team,
      away_team:     g.away_team,
      commence_time: g.commence_time,
      sport_key:     g.sport_key,
      status:        score?.status ?? (g.completed ? 'finished' : 'scheduled'),
      score_home:    score?.home ?? null,
      score_away:    score?.away ?? null,
      updated_at:    now,
    }
  })

  const { error: matchErr } = await supabase
    .from('matches')
    .upsert(matchRows, { onConflict: 'external_id', ignoreDuplicates: false })

  if (matchErr) return jsonError(`Match upsert: ${matchErr.message}`, 500)

  // Also update scores for matches in scoresData that may not be in oddsData
  // (bookmakers close markets for live/finished games)
  const oddIds = new Set(apiData.map((g) => g.id))
  const scoreOnlyGames = scoresData.filter((g) => !oddIds.has(g.id) && g.scores)
  for (const g of scoreOnlyGames) {
    const score = scoreMap.get(g.id)
    if (!score) continue
    await supabase
      .from('matches')
      .update({ status: score.status, score_home: score.home, score_away: score.away, updated_at: now })
      .eq('external_id', g.id)
  }

  // Fetch back IDs to link odds_snapshots
  const externalIds = apiData.map((g) => g.id)
  const { data: savedMatches, error: fetchErr } = await supabase
    .from('matches')
    .select('id, external_id')
    .in('external_id', externalIds)

  if (fetchErr) return jsonError(`Match fetch: ${fetchErr.message}`, 500)

  const matchIdMap = new Map(savedMatches!.map((m) => [m.external_id, m.id]))

  // ── 4. Upsert odds snapshots ────────────────────────────────────
  const snapshotRows: OddsSnapshotRow[] = []

  for (const game of apiData) {
    const matchId = matchIdMap.get(game.id)
    if (!matchId) continue

    for (const bm of game.bookmakers ?? []) {
      const key = bm.key.toLowerCase()
      const h2h = bm.markets?.find((m) => m.key === 'h2h')
      if (!h2h) continue

      const outcomes = h2h.outcomes
      const home = outcomes.find((o) => o.name === game.home_team)?.price ?? null
      const away = outcomes.find((o) => o.name === game.away_team)?.price ?? null
      const draw = outcomes.find((o) => o.name === 'Draw')?.price ?? null

      snapshotRows.push({
        match_id:      matchId,
        bookmaker_key: key,
        h2h_home:      home,
        h2h_draw:      draw,
        h2h_away:      away,
        fetched_at:    now,
      })
    }
  }

  if (snapshotRows.length > 0) {
    const { error: snapErr } = await supabase.from('odds_snapshots').insert(snapshotRows)
    if (snapErr) return jsonError(`Snapshot insert: ${snapErr.message}`, 500)
  }

  // ── 5. Cleanup ──────────────────────────────────────────────────
  const matchCutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const { count: deletedMatches } = await supabase
    .from('matches').delete({ count: 'exact' }).lt('commence_time', matchCutoff)

  const snapCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  await supabase.from('odds_snapshots').delete().lt('fetched_at', snapCutoff)

  return new Response(
    JSON.stringify({
      ok: true,
      matches: matchRows.length,
      snapshots: snapshotRows.length,
      scores_updated: scoreMap.size,
      deleted_matches: deletedMatches ?? 0,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})

// ── Types ────────────────────────────────────────────────────────
interface OddsApiGame {
  id: string
  sport_key: string
  commence_time: string
  completed: boolean
  home_team: string
  away_team: string
  bookmakers: Array<{
    key: string
    title: string
    markets: Array<{
      key: string
      outcomes: Array<{ name: string; price: number }>
    }>
  }>
}

interface ScoresApiGame {
  id: string
  sport_key: string
  commence_time: string
  completed: boolean
  home_team: string
  away_team: string
  scores: Array<{ name: string; score: string }> | null
  last_update: string | null
}

interface OddsSnapshotRow {
  match_id: string
  bookmaker_key: string
  h2h_home: number | null
  h2h_draw: number | null
  h2h_away: number | null
  fetched_at: string
}

function jsonError(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
