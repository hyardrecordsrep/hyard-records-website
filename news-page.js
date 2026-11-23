// /news: the featured (pinned) post on top, then every post newest first
(() => {
  const N = window.HyardNews;
  const $ = (id) => document.getElementById(id);
  const PAGE = 8;
  let shown = PAGE;

  N.load().then((posts) => {
    const featured = posts.find((p) => p.pinned);
    const rest = posts.filter((p) => p !== featured);
    if (featured) {
      $('nw-featured').innerHTML = N.featureCard(featured);
      $('nw-featured-wrap').hidden = false;
      if (featured.presave) N.presave(document.body);
    }
    const render = () => {
      $('nw-list').innerHTML = rest.slice(0, shown).map((p, i) => N.row(p, i)).join('');
      $('nw-more-wrap').hidden = rest.length <= shown;
      $('nw-count').textContent = rest.length ? `${rest.length} ${rest.length === 1 ? 'post' : 'posts'}` : '';
      $('nw-empty').hidden = posts.length > 0;
      if (window.hyardObserve) window.hyardObserve();
    };
    $('nw-more').addEventListener('click', () => { shown += PAGE; render(); });
    // With only the featured post there's nothing else to list
    if (!rest.length && featured) $('nw-list').closest('section').hidden = true;
    render();
  }).catch(() => { $('nw-error').hidden = false; });
})();
