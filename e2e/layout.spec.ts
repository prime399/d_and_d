import { test, expect } from '@playwright/test';

// No page-level or title-screen scrollbars at common desktop sizes.
for (const [w, h] of [[1280, 650], [1280, 720], [1366, 768], [1440, 900], [1536, 730], [1920, 1080]]) {
  test(`no scrollbars ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await page.waitForTimeout(2000);
    const bad = await page.evaluate(() =>
      [document.documentElement, ...document.querySelectorAll('.scr-title, main')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
        .map((el) => `${el.tagName}.${el.className} ${el.scrollWidth}x${el.scrollHeight} > ${el.clientWidth}x${el.clientHeight}`),
    );
    expect(bad).toEqual([]);
  });
}
