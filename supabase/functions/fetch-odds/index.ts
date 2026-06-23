import { createClient } from 'jsr:@supabase/supabase-js@2'

const ODDS_API_KEY  = Deno.env.get('ODDS_API_KEY')!
const SPORT_KEY     = 'soccer_fifa_world_cup'
const REGION        = 'eu'
const MARKETS       = 'h2h'
const ODDS_API_URL  = `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds/?apiKey=${ODDS_API_KEY}&regions=${REGION}&markets=${MARKETS}&oddsFormat=decimal`

// Bookmaker keys we care about (superset – we keep whatever the API returns)
const KNOWN_BOOKMAKERS = new Set([
  '1xbet', 'betway', 'bet365', 'melbet', 'paripesa',
  'betpawa', 'betwinner', 'premierbet', 'linebet', 'betandyou', 'megapari',
])

Deno.serve(async (req) => {
  // Allow CRON invocation (POST) or manual GET
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 1. Fetch from The Odds API ──────────────────────────────
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

  // ── 2. Upsert matches ───────────────────────────────────────
  const matchRows = apiData.map((g) => ({
    external_id:   g.id,
    home_team:     g.home_team,
    away_team:     g.away_team,
    commence_time: g.commence_time,
    sport_key:     g.sport_key,
    status:        g.completed ? 'finished' : 'scheduled',
    updated_at:    new Date().toISOString(),
  }))

  const { error: matchErr } = await supabase
    .from('matches')
    .upsert(matchRows, { onConflict: 'external_id', ignoreDuplicates: false })

  if (matchErr) return jsonError(`Match upsert: ${matchErr.message}`, 500)

  // Fetch back the IDs so we can link odds_snapshots
  const externalIds = apiData.map((g) => g.id)
  const { data: savedMatches, error: fetchErr } = await supabase
    .from('matches')
    .select('id, external_id')
    .in('external_id', externalIds)

  if (fetchErr) return jsonError(`Match fetch: ${fetchErr.message}`, 500)

  const matchIdMap = new Map(savedMatches!.map((m) => [m.external_id, m.id]))

  // ── 3. Upsert odds snapshots ────────────────────────────────
  const now = new Date().toISOString()
  const snapshotRows: OddsSnapshotRow[] = []

  for (const game of apiData) {
    const matchId = matchIdMap.get(game.id)
    if (!matchId) continue

    for (const bm of game.bookmakers ?? []) {
      const key = bm.key.toLowerCase()
      if (!KNOWN_BOOKMAKERS.has(key)) continue

      const h2h = bm.markets?.find((m) => m.key === 'h2h')
      if (!h2h) continue

      const outcomes = h2h.outcomes
      const home = outcomes.find((o) => o.name === game.home_team)?.price ?? null
      const away = outcomes.find((o) => o.name === game.away_team)?.price ?? null
      const draw = outcomes.find((o) => o.name === 'Draw')?.price ?? null

      snapshotRows.push({
        match_id:     matchId,
        bookmaker_key: key,
        h2h_home:     home,
        h2h_draw:     draw,
        h2h_away:     away,
        fetched_at:   now,
      })
    }
  }

  if (snapshotRows.length > 0) {
    const { error: snapErr } = await supabase
      .from('odds_snapshots')
      .insert(snapshotRows)

    if (snapErr) return jsonError(`Snapshot insert: ${snapErr.message}`, 500)
  }

  // ── 4. Purge snapshots older than 24h ──────────────────────
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('odds_snapshots').delete().lt('fetched_at', cutoff)

  return new Response(
    JSON.stringify({ ok: true, matches: matchRows.length, snapshots: snapshotRows.length }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})

// ── Types ───────────────────────────────────────────────────────
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
