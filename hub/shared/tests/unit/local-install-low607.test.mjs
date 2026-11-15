// Lane low607 (independent review rrev2): local-install's Stan section told readers to run
// install.packages("cmdstanr"). cmdstanr is not on CRAN (checked 2026-11-15:
// available.packages(repos = "https://cloud.r-project.org") has no cmdstanr among 25,739
// packages; https://stan-dev.r-universe.dev serves cmdstanr 0.9.0), so that call fails with
// "package 'cmdstanr' is not available". The page must give the r-universe install and say
// that cmdstanr also needs CmdStan itself (cmdstanr::install_cmdstan()).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../../../', import.meta.url);
const html = readFileSync(new URL('local-install/index.html', ROOT), 'utf8');
const text = html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

test('no bare CRAN install of cmdstanr anywhere on the page', () => {
  const calls = text.match(/install\.packages\(\s*"cmdstanr"[^)]*\)/g) || [];
  assert.ok(calls.length >= 1, 'expected at least one cmdstanr install instruction');
  for (const c of calls) assert.match(c, /repos\s*=\s*c\("https:\/\/stan-dev\.r-universe\.dev"/, c);
});

test('Stan section gives the r-universe install and the CmdStan step', () => {
  const i = text.indexOf('Stan (for rstan');
  assert.ok(i > 0, 'Stan section not found');
  const sec = text.slice(i, i + 900);
  assert.match(sec, /install\.packages\("cmdstanr", repos = c\("https:\/\/stan-dev\.r-universe\.dev", getOption\("repos"\)\)\)/);
  assert.match(sec, /not on CRAN/);
  assert.match(sec, /cmdstanr::install_cmdstan\(\)/);
  assert.match(sec, /CmdStan/);
});
