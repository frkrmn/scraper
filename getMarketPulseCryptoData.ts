import { PageWithCursor } from "puppeteer-real-browser";

export const getMarketPulseCryptoData = async ({
  page,
}: {
  page: PageWithCursor;
}): Promise<string> => {
  console.log("Extracting MarketPulse Kripto data...");

  const value = await page
    .evaluate(() => {
      const allPulseValues = document.querySelectorAll("#pulseValue");
      for (const el of allPulseValues) {
        let node: Element | null = el.parentElement;
        while (node) {
          if (node.textContent?.includes("MarketPulse Kripto")) {
            return el.textContent?.trim() || "unknown";
          }
          node = node.parentElement;
        }
      }
      return "unknown";
    })
    .catch(() => "unknown");

  console.log("Extracted MarketPulse Kripto value:", value);
  return value;
};
