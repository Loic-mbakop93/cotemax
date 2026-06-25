/**
 * premierBet Cameroon scraper — text-parse approach
 *
 * The page renders match data as structured plain text in this format:
 *   dim. 28/06. 10:00
 *   International | Coupe du Monde
 *   [Team 1]
 *   [Team 2]
 *   1
 *   [home_odd]
 *   X
 *   [draw_odd]
 *   2
 *   [away_odd]
 *
 * We grab document.body.innerText and parse it with regex.
 */
import 'dotenv/config'
import { chromium } from 'playwright'
import { pushOdds } from '../lib/supabase.js'

const PAGE_URL = 'https://www.premierbet.cm/sports/football'
const BM_KEY   = 'premierbet'

// French → English team name translation for World Cup nations
const FR_TO_EN = {
  'afrique du sud': 'South Africa',
  'algérie': 'Algeria',
  'algerie': 'Algeria',
  'allemagne': 'Germany',
  'angleterre': 'England',
  'arabie saoudite': 'Saudi Arabia',
  'argentine': 'Argentina',
  'australie': 'Australia',
  'autriche': 'Austria',
  'belgique': 'Belgium',
  'bolivie': 'Bolivia',
  'brésil': 'Brazil',
  'bresil': 'Brazil',
  'cameroun': 'Cameroon',
  'canada': 'Canada',
  'chili': 'Chile',
  'chine': 'China PR',
  'colombie': 'Colombia',
  'corée du nord': 'Korea DPR',
  'corée du sud': 'Korea Republic',
  'corée': 'Korea Republic',
  'costa rica': 'Costa Rica',
  'côte d´ivoire': "Ivory Coast",
  'côte d\'ivoire': "Ivory Coast",
  'croatie': 'Croatia',
  'cuba': 'Cuba',
  'curaçao': 'Curaçao',
  'danemark': 'Denmark',
  'ecosse': 'Scotland',
  'équateur': 'Ecuador',
  'equateur': 'Ecuador',
  'espagne': 'Spain',
  'états-unis': 'United States',
  'etats-unis': 'United States',
  'france': 'France',
  'ghana': 'Ghana',
  'grèce': 'Greece',
  'honduras': 'Honduras',
  'hongrie': 'Hungary',
  'inde': 'India',
  'iran': 'IR Iran',
  'irlande': 'Ireland',
  'islande': 'Iceland',
  'italie': 'Italy',
  'jamaïque': 'Jamaica',
  'japon': 'Japan',
  'jordanie': 'Jordan',
  'kenya': 'Kenya',
  'maroc': 'Morocco',
  'mexique': 'Mexico',
  'nigeria': 'Nigeria',
  'norvège': 'Norway',
  'nouvelle-zélande': 'New Zealand',
  'pakistan': 'Pakistan',
  'panama': 'Panama',
  'paraguay': 'Paraguay',
  'pays-bas': 'Netherlands',
  'pérou': 'Peru',
  'perou': 'Peru',
  'pologne': 'Poland',
  'portugal': 'Portugal',
  'qatar': 'Qatar',
  'république de corée': 'Korea Republic',
  'republique de coree': 'Korea Republic',
  'république tchèque': 'Czechia',
  'republique tcheque': 'Czechia',
  'roumanie': 'Romania',
  'russie': 'Russia',
  'sénégal': 'Senegal',
  'senegal': 'Senegal',
  'serbie': 'Serbia',
  'slovaquie': 'Slovakia',
  'slovénie': 'Slovenia',
  'suède': 'Sweden',
  'suede': 'Sweden',
  'suisse': 'Switzerland',
  'tunisie': 'Tunisia',
  'turquie': 'Turkey',
  'ukraine': 'Ukraine',
  'uruguay': 'Uruguay',
  'venezuela': 'Venezuela',
  // Additional names seen in premierBet
  'irak': 'Iraq',
  'cap vert': 'Cape Verde',
  'egypte': 'Egypt',
  'égypte': 'Egypt',
  'rép. dém. du congo': 'DR Congo',
  'rep. dem. du congo': 'DR Congo',
  'république démocratique du congo': 'DR Congo',
  'ouzbékistan': 'Uzbekistan',
  'ouzbekistan': 'Uzbekistan',
  'oman': 'Oman',
  'bahreïn': 'Bahrain',
  'bahrain': 'Bahrain',
}

function translateTeamName(name) {
  const lower = name.toLowerCase().normalize('NFC')
  return FR_TO_EN[lower] ?? name
}

const WC_MARKERS = [
  'coupe du monde',
  'world cup',
  'international | coupe du monde',
]

export async function scrapePremierbet() {
  console.log(`[${BM_KEY}] Starting scrape…`)

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  })

  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    locale: 'fr-FR',
    viewport: { width: 390, height: 844 },
  })

  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  const page = await ctx.newPage()
  const results = []

  try {
    await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 45000 })
    await page.waitForTimeout(4000)

    // Scroll to load lazy content
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight))
      await page.waitForTimeout(600)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(800)

    const bodyText = await page.evaluate(() => document.body.innerText)
    console.log(`[${BM_KEY}] Page text length: ${bodyText.length}`)

    const parsed = parseBodyText(bodyText)
    results.push(...parsed)

    console.log(`[${BM_KEY}] Found ${results.length} World Cup match(es).`)
    if (results.length) {
      await pushOdds(BM_KEY, results)
    }
  } catch (err) {
    console.error(`[${BM_KEY}] Error:`, err.message)
  } finally {
    await browser.close()
  }

  return results
}

/**
 * Parse the full body.innerText of premierBet to extract World Cup 1X2 odds.
 *
 * Page block structure:
 *   [time line e.g. "dim. 28/06. 10:00"]
 *   International | Coupe du Monde        ← WC marker line
 *   [Team 1]
 *   [Team 2]
 *   1
 *   [home_odd]
 *   X
 *   [draw_odd]
 *   2
 *   [away_odd]
 */
function parseBodyText(text) {
  const results = []
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase()

    // Detect a World Cup competition marker line
    const isWC = WC_MARKERS.some(m => line.includes(m))
    if (!isWC) continue

    // Team 1 and Team 2 are on the next two lines
    const team1 = lines[i + 1] ?? ''
    const team2 = lines[i + 2] ?? ''

    if (!team1 || !team2 || team1 === team2) continue
    if (team1.length < 3 || team2.length < 3) continue
    // Skip if they look like odds or UI text
    if (/^\d+(\.\d+)?$/.test(team1) || /^\d+(\.\d+)?$/.test(team2)) continue

    // Odds follow: "1", home_odd, "X", draw_odd, "2", away_odd
    // Scan the next ~10 lines after team names
    const oddsStart = i + 3
    const numericLines = []

    for (let j = oddsStart; j < Math.min(oddsStart + 12, lines.length); j++) {
      // Require decimal format (e.g. "3.75") — skips "1"/"2" label lines
      if (/^\d+\.\d+$/.test(lines[j])) {
        numericLines.push(parseFloat(lines[j]))
        if (numericLines.length === 3) break
      }
      // Stop if we hit the next match block (time pattern or WC marker)
      const jl = lines[j].toLowerCase()
      if (j > oddsStart && (WC_MARKERS.some(m => jl.includes(m)) || /^\w+\.\s+\d+\/\d+\./.test(lines[j]))) break
    }

    if (numericLines.length === 3) {
      results.push({
        home_team: translateTeamName(team1),
        away_team: translateTeamName(team2),
        h2h_home: numericLines[0],
        h2h_draw: numericLines[1],
        h2h_away: numericLines[2],
      })
      // Jump past the odds we just consumed
      i += 2
    }
  }

  return results
}

// Allow running directly: node scrapers/premierbet.js
if (process.argv[1]?.includes('premierbet')) {
  scrapePremierbet()
}
