/**
 * CoteMax Scraper Runner
 * Runs all scrapers every 5 minutes and pushes odds to Supabase.
 */
import 'dotenv/config'
import cron from 'node-cron'
import { scrapeBetpawa }   from './scrapers/betpawa.js'
import { scrapePremierbet } from './scrapers/premierbet.js'

const SCRAPERS = [
  { name: 'betPawa',    fn: scrapeBetpawa },
  { name: 'premierBet', fn: scrapePremierbet },
]

async function runAll() {
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

// Run immediately on start
runAll()

// Then every 5 minutes
cron.schedule('*/5 * * * *', runAll)

console.log('CoteMax scrapers running — every 5 minutes. Press Ctrl+C to stop.')
