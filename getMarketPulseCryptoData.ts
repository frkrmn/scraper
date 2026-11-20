import { PageWithCursor } from "puppeteer-real-browser";

export const getMarketPulseCryptoData = async ({
  page,
}: {
  page: PageWithCursor;
}): Promise<string> => {
  console.log("Extracting MarketPulse Kripto data...");

  await page.waitForFunction(() =>
    [...document.querySelectorAll("#pulseValue")].some(el => Boolean(el.textContent?.trim())),
    { timeout: 30000 });
  const value = await page.evaluate(() => {
    const pulses = [...document.querySelectorAll("#pulseValue")];
    if (pulses.length !== 1) throw new Error(`Expected one MarketPulse value, got ${pulses.length}`);
    return pulses[0].textContent?.trim().replace(/%$/, "") || "unknown";
  });

  console.log("Extracted MarketPulse Kripto value:", value);
  return value;
};
