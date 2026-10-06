async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const check = (value, message) => { if (!value) throw new Error(message); };
  const origin = page.url().startsWith('http') ? await page.evaluate(() => location.origin) : 'http://localhost:3000';
  await page.goto(`${origin}/`);
  await page.locator('#hero-heading').waitFor();
  await page.evaluate(() => document.fonts.ready);
  check(await page.evaluate(() => [...document.fonts].some(face => face.family.includes('Nunito Landing') && face.weight === '800' && face.status === 'loaded')), 'Static landing headline font did not load');
  const measurements = [];
  for (const reducedMotion of ['no-preference', 'reduce']) {
    await page.emulateMedia({ reducedMotion });
    for (const [width, height] of [[320,720],[360,800],[390,844],[430,932],[700,900],[768,1024],[844,390],[1024,768],[1440,1000]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Document overflow at ${width} (${reducedMotion})`);
      const hero = page.locator('main > section').first();
      const cta = hero.getByRole('link', { name: 'Start watching' });
      const ctaBox = await cta.boundingBox();
      if (width <= 430) check(ctaBox.y + ctaBox.height <= height, `Primary CTA is below first fold at ${width}`);
      const dock = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
      check(await dock.count() === 0, `Landing should use its own navigation at ${width}`);
      const undersized = await page.locator('main button, main a, header a, footer a').evaluateAll(nodes => nodes.filter(n => {
        const box = n.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && (box.width < 43.9 || box.height < 43.9);
      }).map(n => ({ label: n.getAttribute('aria-label') || n.textContent?.trim(), width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height })));
      check(undersized.length === 0, `Undersized targets at ${width}: ${JSON.stringify(undersized)}`);
      const headingsOutside = await page.locator('main h1, main h2, main h3').evaluateAll(nodes => nodes.filter(n => {
        const r = n.getBoundingClientRect();
        // Poster rails intentionally scroll horizontally.
        return !n.closest('[role="region"]') && r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
      }).map(n => n.textContent));
      check(!headingsOutside.length, `Clipped headings at ${width}: ${headingsOutside}`);
      measurements.push({ width, height, reducedMotion, heroHeight: Math.round((await hero.boundingBox()).height), ctaBottom: Math.round(ctaBox.y + ctaBox.height), noOverflow: true, touchTargets: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Native buttons announce selected state and update both title and destination.
  const choices = page.locator('[aria-label="Choose a headliner"] button');
  check(await choices.count() === 3, 'Expected three real headliner choices');
  const before = await page.locator('#headliner-title').innerText();
  await choices.nth(1).click();
  const selectedTitle = await page.locator('#headliner-title').innerText();
  check(before !== selectedTitle, 'Headliner title did not update');
  check(await choices.nth(1).getAttribute('aria-pressed') === 'true', 'Headliner selected state missing');
  const posterLink = page.locator('[class*="headlinerArt"]').first();
  const selectedLink = page.getByRole('link', { name: 'Meet your next watch' });
  check(await posterLink.getAttribute('href') === await selectedLink.getAttribute('href'), 'Headliner cover destination is stale');
  const tones = page.locator('fieldset button');
  const replies = new Set();
  for (const tone of await tones.all()) {
    await tone.click();
    check(await tone.getAttribute('aria-pressed') === 'true', 'Tone pressed state missing');
    replies.add(await page.locator('p[aria-live="polite"]').innerText());
  }
  check(replies.size === 4, 'Companion tone previews do not update');
  const cartoons = page.locator('#cartoons');
  const rail = cartoons.getByRole('region', { name: 'Cartoon catalog preview', exact: true });
  check(await rail.locator('a').count() > 0, 'Cartoon catalog missing');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await rail.scrollIntoViewIfNeeded();
  await rail.evaluate(el => el.scrollLeft = 0);
  await cartoons.getByRole('button', { name: 'Scroll posters right' }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Cartoon catalog preview"]').scrollLeft > 0);
  const afterNext = await rail.evaluate(el => el.scrollLeft);
  await cartoons.getByRole('button', { name: 'Scroll posters left' }).click();
  await page.waitForFunction(previous => document.querySelector('[aria-label="Cartoon catalog preview"]').scrollLeft < previous, afterNext);
  await rail.focus();
  check(await rail.evaluate(el => el === document.activeElement), 'Cartoon rail cannot receive keyboard focus');
  await page.getByRole('link', { name: 'Skip to content' }).focus();
  check((await page.getByRole('link', { name: 'Skip to content' }).boundingBox()).y >= 0, 'Skip link is hidden when focused');
  await page.locator('body').click({position:{x:10,y:10}});
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const section of await page.locator('main > section').all()) {
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({path:'.playwright-cli/landing-responsive-mobile.png',fullPage:true});
  await page.screenshot({path:'.playwright-cli/landing-responsive-mobile-hero.png'});
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({path:'.playwright-cli/landing-responsive-desktop.png'});
  check(errors.length === 0, `Runtime errors: ${errors.join('; ')}`);
  check(await page.locator('nextjs-portal').count() === 0, 'Next.js error overlay present');
  return {measurements,headlinerSelection:true,coverDestinationUpdates:true,companionTones:4,cartoonNavigation:true,keyboardFocus:true,runtimeErrors:errors};
}
