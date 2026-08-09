import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDiaryEntries } from '../src/fetcher.js';

test('parseDiaryEntries reads review and stable film identifiers', () => {
  const html = `
    <table id="diary-table">
      <tr class="diary-entry-row">
        <td class="col-daydate"><a href="/someone/diary/films/for/2025/02/03/">03</a></td>
        <td class="col-production">
          <div data-item-slug="heat-1995" data-postered-identifier='{"lid":"2G9K","uid":"film:18003","type":"film"}'></div>
          <h2><a href="/someone/film/heat/">Heat</a></h2>
        </td>
        <td class="col-releaseyear"><span>1995</span></td>
        <td class="col-rating"><span class="rating rated-10">★★★★★</span></td>
        <td class="col-like"><span class="icon-liked"></span></td>
        <td class="col-rewatch icon-status-off"></td>
        <td class="col-review"><a class="icon-review" href="/someone/film/heat/">Read review</a></td>
      </tr>
      <tr class="diary-entry-row">
        <td class="col-daydate"><a href="/someone/diary/films/for/2025/02/04/">04</a></td>
        <td class="col-production"><h2><a href="/someone/film/alien/">Alien</a></h2></td>
        <td class="col-releaseyear"><span>1979</span></td>
        <td class="col-rating"></td>
        <td class="col-like"></td>
        <td class="col-rewatch icon-status-off"></td>
        <td class="col-review icon-status-off"></td>
      </tr>
    </table>`;

  const { entries, parseMismatch } = parseDiaryEntries(html, 2025);

  assert.equal(parseMismatch, false);
  assert.deepEqual(
    {
      reviewed: entries[0].reviewed,
      reviewUrl: entries[0].reviewUrl,
      filmUid: entries[0].filmUid,
      lid: entries[0].lid,
      slug: entries[0].slug
    },
    {
      reviewed: true,
      reviewUrl: 'https://letterboxd.com/someone/film/heat/',
      filmUid: 'film:18003',
      lid: '2G9K',
      slug: 'heat-1995'
    }
  );
  assert.equal(entries[1].reviewed, false);
  assert.equal(entries[1].reviewUrl, null);
  assert.equal(entries[1].filmUid, null);
  assert.equal(entries[1].lid, null);
  assert.equal(entries[1].slug, 'alien');
});
