import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

/**
 * Push scraped odds into odds_snapshots.
 * Finds the matching match by home/away team name, then inserts a snapshot row.
 *
 * @param {string} bookmakerKey  - e.g. 'betpawa'
 * @param {Array}  odds          - [{ home_team, away_team, h2h_home, h2h_draw, h2h_away }]
 */
export async function pushOdds(bookmakerKey, odds) {
  if (!odds.length) {
    console.log(`[${bookmakerKey}] No odds to push.`)
    return
  }

  const now = new Date().toISOString()
  const rows = []

  for (const o of odds) {
    // Match by team names (case-insensitive, partial match)
    const { data: matches } = await supabase
      .from('matches')
      .select('id, home_team, away_team')
      .ilike('home_team', `%${o.home_team}%`)
      .ilike('away_team', `%${o.away_team}%`)
      .limit(1)

    if (!matches?.length) {
      // Try reverse (some sites swap home/away display)
      const { data: rev } = await supabase
        .from('matches')
        .select('id, home_team, away_team')
        .ilike('home_team', `%${o.away_team}%`)
        .ilike('away_team', `%${o.home_team}%`)
        .limit(1)

      if (rev?.length) {
        rows.push({
          match_id:      rev[0].id,
          bookmaker_key: bookmakerKey,
          h2h_home:      o.h2h_away,  // swapped
          h2h_draw:      o.h2h_draw,
          h2h_away:      o.h2h_home,  // swapped
          fetched_at:    now,
        })
      } else {
        console.warn(`[${bookmakerKey}] No match found for: ${o.home_team} vs ${o.away_team}`)
      }
      continue
    }

    rows.push({
      match_id:      matches[0].id,
      bookmaker_key: bookmakerKey,
      h2h_home:      o.h2h_home,
      h2h_draw:      o.h2h_draw,
      h2h_away:      o.h2h_away,
      fetched_at:    now,
    })
  }

  if (!rows.length) return

  const { error } = await supabase.from('odds_snapshots').insert(rows)
  if (error) {
    console.error(`[${bookmakerKey}] Insert error:`, error.message)
  } else {
    console.log(`[${bookmakerKey}] Pushed ${rows.length} odds snapshot(s).`)
  }
}
