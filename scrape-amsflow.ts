import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";
import isCI from "is-ci";
import dotenv from "dotenv";

if (!isCI) {
  dotenv.config({ path: ".env.local" });
}

const BASE_URL = "https://amsflow.com/data-reports/sentiment";

const MARKETS = [
  { key: "us",          label: "US Market",    slug: "us" },
  { key: "eu",          label: "EU Market",    slug: "eu" },
  { key: "uk",          label: "UK Market",    slug: "uk" },
  { key: "japan",       label: "Japan",        slug: "japan" },
  { key: "china",       label: "China",        slug: "china" },
  { key: "australia",   label: "Australia",    slug: "australia" },
  { key: "canada",      label: "Canada",       slug: "canada" },
  { key: "gold",        label: "Gold",         slug: "gold" },
  { key: "silver",      label: "Silver",       slug: "silver" },
  { key: "southkorea",  label: "South Korea",  slug: "southkorea" },
];

type HistoryRow = {
  date: string;
  score: number | null;
  classification: string;
  assetPrice: string;
};

type HistoricalValue = {
  score: number | null;
  classification: string;
};

type YearlyExtreme = {
  date: string;
  score: number | null;
  classification: string;
};

type MarketSentiment = {
  key: string;
  label: string;
  score: number | null;
  classification: string;
  historical: {
    yesterday: HistoricalValue;
    lastWeek: HistoricalValue;
    lastMonth: HistoricalValue;
  };
  yearlyHigh: YearlyExtreme;
  yearlyLow: YearlyExtreme;
  history: HistoryRow[];
};

type AmsflowData = {
  markets: MarketSentiment[];
  lastUpdated: string;
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseScore(text: string): number | null {
  const match = text.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

// "Extreme Fear – 22"  →  { score: 22, classification: "Extreme Fear" }
function parseClassificationAndScore(text: string): HistoricalValue {
  const dashMatch = text.match(/^(.*?)\s*[–-]\s*(\d+)$/);
  if (dashMatch) {
    return {
      classification: dashMatch[1].trim(),
      score: parseInt(dashMatch[2], 10),
    };
  }
  return { classification: text.trim(), score: null };
}

async function scrapeMarket(market: typeof MARKETS[number]): Promise<MarketSentiment> {
  const url = `${BASE_URL}/${market.slug}`;
  console.log(`Fetching ${url}...`);

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // --- Current score ---
  // Look for h2 "Fear & Greed Index" section, then find the score number
  let score: number | null = null;
  let classification = "unknown";

  // The score is a large standalone number, classification is text right after
  // Try common patterns
  $("h2, h1").each((_, el) => {
    const text = $(el).text().trim();
    if (text.includes("Fear") && text.includes("Greed")) {
      // Score is often in a sibling element
      const parent = $(el).parent();
      parent.find("p, div, span").each((_, child) => {
        const t = $(child).text().trim();
        if (/^\d+$/.test(t) && score === null) {
          score = parseInt(t, 10);
        }
      });
    }
  });

  // Fallback: search for standalone 1-3 digit number in a prominent element
  if (score === null) {
    $("p, span, div").each((_, el) => {
      const text = $(el).text().trim();
      if (/^\d{1,3}$/.test(text) && score === null) {
        const num = parseInt(text, 10);
        if (num >= 0 && num <= 100) score = num;
      }
    });
  }

  // Classification words
  const classWords = ["Extreme Fear", "Extreme Greed", "Fear", "Greed", "Neutral"];
  $("p, span, h3, h4").each((_, el) => {
    const text = $(el).text().trim();
    if (classWords.includes(text) && classification === "unknown") {
      classification = text;
    }
  });

  // --- Historical values ---
  const yesterday: HistoricalValue = { score: null, classification: "unknown" };
  const lastWeek: HistoricalValue = { score: null, classification: "unknown" };
  const lastMonth: HistoricalValue = { score: null, classification: "unknown" };

  const fullText = $("body").text();

  const yesterdayMatch = fullText.match(/Yesterday\s+([\w\s]+?)\s*[–-]\s*(\d+)/);
  if (yesterdayMatch) {
    yesterday.classification = yesterdayMatch[1].trim();
    yesterday.score = parseInt(yesterdayMatch[2], 10);
  }

  const lastWeekMatch = fullText.match(/Last\s+Week\s+([\w\s]+?)\s*[–-]\s*(\d+)/);
  if (lastWeekMatch) {
    lastWeek.classification = lastWeekMatch[1].trim();
    lastWeek.score = parseInt(lastWeekMatch[2], 10);
  }

  const lastMonthMatch = fullText.match(/Last\s+Month\s+([\w\s]+?)\s*[–-]\s*(\d+)/);
  if (lastMonthMatch) {
    lastMonth.classification = lastMonthMatch[1].trim();
    lastMonth.score = parseInt(lastMonthMatch[2], 10);
  }

  // --- Yearly high & low ---
  const yearlyHigh: YearlyExtreme = { date: "unknown", score: null, classification: "unknown" };
  const yearlyLow: YearlyExtreme = { date: "unknown", score: null, classification: "unknown" };

  const highMatch = fullText.match(/Yearly\s+High\s+([\w,\s]+?\d{4})\s*([\w\s]+?)\s*[–-]\s*(\d+)/);
  if (highMatch) {
    yearlyHigh.date = highMatch[1].trim();
    yearlyHigh.classification = highMatch[2].trim();
    yearlyHigh.score = parseInt(highMatch[3], 10);
  }

  const lowMatch = fullText.match(/Yearly\s+Low\s+([\w,\s]+?\d{4})\s*([\w\s]+?)\s*[–-]\s*(\d+)/);
  if (lowMatch) {
    yearlyLow.date = lowMatch[1].trim();
    yearlyLow.classification = lowMatch[2].trim();
    yearlyLow.score = parseInt(lowMatch[3], 10);
  }

  // --- Historical table (last 30 days) ---
  const history: HistoryRow[] = [];

  $("table").each((_, table) => {
    const headers: string[] = [];
    $(table).find("thead th").each((_, th) => {
      headers.push($(th).text().trim().toLowerCase());
    });

    // Check if this is the sentiment table (has "fear" or "greed" column)
    const isSentimentTable = headers.some(
      (h) => h.includes("fear") || h.includes("greed") || h.includes("date")
    );
    if (!isSentimentTable) return;

    $(table)
      .find("tbody tr")
      .each((_, tr) => {
        const cells = $(tr)
          .find("td")
          .map((_, td) => $(td).text().trim())
          .get();

        if (cells.length >= 3) {
          const rowScore = parseScore(cells[1]);
          const parsed = parseClassificationAndScore(cells[2]);
          history.push({
            date: cells[0],
            score: rowScore,
            classification: parsed.classification || cells[2],
            assetPrice: cells[3] ?? "",
          });
        }
      });
  });

  console.log(
    `✓ ${market.label}: score=${score}, classification=${classification}, history=${history.length} rows`
  );

  return {
    key: market.key,
    label: market.label,
    score,
    classification,
    historical: { yesterday, lastWeek, lastMonth },
    yearlyHigh,
    yearlyLow,
    history,
  };
}

async function run() {
  const results: MarketSentiment[] = [];

  for (const market of MARKETS) {
    try {
      const data = await scrapeMarket(market);
      results.push(data);
    } catch (err) {
      console.error(`✗ Failed to scrape ${market.label}:`, err);
      results.push({
        key: market.key,
        label: market.label,
        score: null,
        classification: "unknown",
        historical: {
          yesterday: { score: null, classification: "unknown" },
          lastWeek: { score: null, classification: "unknown" },
          lastMonth: { score: null, classification: "unknown" },
        },
        yearlyHigh: { date: "unknown", score: null, classification: "unknown" },
        yearlyLow: { date: "unknown", score: null, classification: "unknown" },
        history: [],
      });
    }

    // Polite delay between requests
    await delay(2000);
  }

  const output: AmsflowData = {
    markets: results,
    lastUpdated: new Date().toISOString(),
  };

  const apiDir = path.join(process.cwd(), "public", "api");
  if (!fs.existsSync(apiDir)) {
    fs.mkdirSync(apiDir, { recursive: true });
  }

  const filePath = path.join(apiDir, "amsflow.json");
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2), "utf-8");
  console.log("✓ Amsflow data saved to", filePath);
}

run().catch(console.error);
