import { PageWithCursor } from "puppeteer-real-browser";
import { sleep } from "moderndash";

export type NormalizedDecision =
  | "STRONG_BUY"
  | "BUY"
  | "HOLD"
  | "SELL"
  | "STRONG_SELL"
  | "UNKNOWN";

type AlgoData = {
  decision: NormalizedDecision;
  rawDecision: string; // ham metin, debug/kontrol için saklanıyor
};

// kmquant.com sayfaları kimi zaman Türkçe ("Al", "Sat", "Güçlü Al"),
// kimi zaman İngilizce ("buy", "Hold") metin döndürüyor.
// Burada hepsi tek bir standart koda çevriliyor.
const DECISION_MAP: Record<string, NormalizedDecision> = {
  al: "BUY",
  buy: "BUY",
  "güçlü al": "STRONG_BUY",
  "strong buy": "STRONG_BUY",
  sat: "SELL",
  sell: "SELL",
  "güçlü sat": "STRONG_SELL",
  "strong sell": "STRONG_SELL",
  hold: "HOLD",
  tut: "HOLD",
  bekle: "HOLD",
  unknown: "UNKNOWN",
};

function normalizeDecision(raw: string): NormalizedDecision {
  const key = raw.trim().toLowerCase();
  return DECISION_MAP[key] ?? "UNKNOWN";
}

export async function getAlgoData({
  page,
  url,
}: {
  page: PageWithCursor;
  url: string;
}): Promise<AlgoData> {
  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await sleep(5000);

  const getValue = async (selector: string) =>
    page
      .$eval(selector, (el) => el.textContent?.trim() || "unknown")
      .catch(() => "unknown");

  const rawDecision = await getValue("#decision-section .kpi-value");

  return {
    decision: normalizeDecision(rawDecision),
    rawDecision,
  };
}
