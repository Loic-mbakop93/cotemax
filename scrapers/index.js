/**
 * CoteMax Scraper Runner
 *
 * Schedule logic (checked every 15 minutes):
 *   - Match currently live (within 105 min of kickoff): SKIP — markets suspended
 *   - Within 2 hours before kickoff:                    RUN  — odds moving fast
 *   - Otherwise:                                        RUN every 30 min only
 */
import 'dotenv/config'
import cron from 'node-cron'
import { createClient } from '@supabase/supabase-js'
import { scrapeBetpawa }    from './scrapers/betpawa.js'
import { scrapePremierbet } from './scrapers/premierbet.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const SCRAPERS = [
  { name: 'betPawa',    fn: scrapeBetpawa },
  { name: 'premierBet', fn: scrapePremierbet },
]

// Returns true if we should run scrapers right now based on match schedule
async function shouldRun() {
  const now = new Date()

  // Fetch matches in the next 2 hours or started in the last 2 hours
  const windowStart = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
  const windowEnd   = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString()

  const { data: matches } = await supabase
    .from('matches')
    .select('commence_time, status')
    .gte('commence_time', windowStart)
    .lte('commence_time', windowEnd)

  if (!matches?.length) {
    // No matches within ±2h — run on the 30-min tick only
    return now.getMinutes() === 0 || now.getMinutes() === 30
  }

  for (const match of matches) {
    const kickoff  = new Date(match.commence_time)
    const minsToKO = (kickoff - now) / 60000        // positive = future
    const minsSinceKO = (now - kickoff) / 60000     // positive = past

    // Match is live (kickoff happened, less than 105 min ago — 90 min + stoppage)
    if (minsSinceKO >= 0 && minsSinceKO < 105) {
      console.log(`[scheduler] Match live (${Math.round(minsSinceKO)} min in) — skipping scrape`)
      return false
    }

    // Within 2 hours before kickoff — run every 15 min (every tick)
    if (minsToKO >= 0 && minsToKO <= 120) {
      console.log(`[scheduler] Match in ${Math.round(minsToKO)} min — running (pre-match mode)`)
      return true
    }
  }

  // Matches exist but none are live or imminent — run on 30-min tick
  return now.getMinutes() === 0 || now.getMinutes() === 30
}

async function runAll() {
  const run = await shouldRun()
  if (!run) {
    console.log(`[${new Date().toISOString()}] Skipping — no pre-match activity`)
    return
  }

  console.log(`\n[${new Date().toISOString()}] Running all scrapers…`)
  for (const { name, fn } of SCRAPERS) {
    try {
      await fn()
    } catch (err) {
      console.error(`[${name}] Unhandled error:`, err.message)
    }
  }
  console.log(`[${new Date().toISOString()}] Done.`)
}

// Run immediately on start (always, to populate on deploy)
console.log('CoteMax scrapers starting…')
runAll()

// Check every 15 minutes — scheduler decides whether to actually scrape
cron.schedule('*/15 * * * *', runAll)

console.log('CoteMax scrapers running. Schedule: 30 min idle · 15 min pre-match · paused during live.')
