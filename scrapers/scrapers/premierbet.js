/**
 * premierBet Cameroon scraper
 * Target: https://www.premierbet.cm/sports/football
 * Filters for FIFA World Cup matches and extracts 1X2 odds.
 */
import 'dotenv/config'
import { launchBrowser, newStealthPage, parseOdd } from '../lib/browser.js'
import { pushOdds } from '../lib/supabase.js'

const URL    = 'https://www.premierbet.cm/sports/football'
const BM_KEY = 'premierbet'
const WC_KEYWORDS = ['world cup', 'coupe du monde', 'fifa', 'wc 2026', 'world cup 2026']

export async function scrapePremierbet() {
  console.log(`[${BM_KEY}] Starting scrape…`)
  const browser = await launchBrowser()
  const page    = await newStealthPage(browser)
  const results = []

  try {
    await page.goto(URL, { waitUntil: 'networkidle' })

    // Accept cookies / age verification if present
    for (const selector of [
      'button:has-text("Accept")',
      'button:has-text("Accepter")',
      'button:has-text("J\'ai 18")',
      '[class*="cookie"] button',
      '[class*="modal"] button:has-text("OK")',
    ]) {
      const btn = page.locator(selector).first()
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click()
        await page.waitForTimeout(500)
      }
    }

    // Wait for content to render
    await page.waitForSelector('[class*="event"], [class*="match"], [class*="game"]', { timeout: 15000 })
      .catch(() => console.log(`[${BM_KEY}] Selector timeout – page may have different structure`))

    // premierBet typically shows competition headers above groups of matches
    // Strategy 1: competition header → child match rows
    const headers = await page.locator('[class*="competition-header"], [class*="league-header"], [class*="sport-header"], h2, h3').all()

    for (const header of headers) {
      const headerText = (await header.innerText().catch(() => '')).toLowerCase()
      if (!WC_KEYWORDS.some(k => headerText.includes(k))) continue

      // Get parent container then find all match rows inside
      const container = header.locator('xpath=ancestor::*[contains(@class,"competition") or contains(@class,"group")][1]')
      const rows = await container.locator('[class*="event"], [class*="match"]').all()

      for (const row of rows) {
        const extracted = await extractMatchFromRow(row)
        if (extracted) results.push(extracted)
      }
    }

    // Strategy 2: data attributes (many modern betting sites use data-* attrs)
    if (!results.length) {
      console.log(`[${BM_KEY}] Trying data-attribute strategy…`)
      const wcRows = await page.locator('[data-competition*="World Cup"], [data-league*="World Cup"], [data-tournament*="World"]').all()
      for (const row of wcRows) {
        const extracted = await extractMatchFromRow(row)
        if (extracted) results.push(extracted)
      }
    }

    // Strategy 3: full page text scan — look for rows with 3 numeric odds after team names
    if (!results.length) {
      console.log(`[${BM_KEY}] Trying full-page scan strategy…`)
      const allRows = await page.locator('[class*="event-item"], [class*="match-item"], [class*="row"]').all()
      for (const row of allRows) {
        const text = (await row.innerText().catch(() => '')).toLowerCase()
        if (!WC_KEYWORDS.some(k => text.includes(k))) continue
        const extracted = await extractMatchFromRow(row)
        if (extracted) results.push(extracted)
      }
    }

    console.log(`[${BM_KEY}] Found ${results.length} World Cup match(es).`)
    await pushOdds(BM_KEY, results)
  } catch (err) {
    console.error(`[${BM_KEY}] Error:`, err.message)
  } finally {
    await browser.close()
  }

  return results
}

async function extractMatchFromRow(row) {
  try {
    // Team names
    const teamEls = await row.locator('[class*="team"], [class*="participant"], [class*="competitor"]').allInnerTexts()
    if (teamEls.length < 2) return null

    const home_team = teamEls[0].trim()
    const away_team = teamEls[teamEls.length - 1].trim()
    if (!home_team || !away_team || home_team === away_team) return null

    // Odds — look for 3 price buttons
    const oddEls = await row.locator('[class*="odd"], [class*="price"], [class*="outcome"], [class*="coefficient"]').allInnerTexts()
    if (oddEls.length < 3) return null

    const h2h_home = parseOdd(oddEls[0])
    const h2h_draw = parseOdd(oddEls[1])
    const h2h_away = parseOdd(oddEls[2])

    if (!h2h_home && !h2h_away) return null

    return { home_team, away_team, h2h_home, h2h_draw, h2h_away }
  } catch {
    return null
  }
}

// Allow running directly: node scrapers/premierbet.js
if (process.argv[1].includes('premierbet')) {
  scrapePremierbet()
}
