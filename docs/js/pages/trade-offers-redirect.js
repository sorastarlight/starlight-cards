const params = new URLSearchParams(location.search);
const next = new URLSearchParams();
const tab = (params.get('tab') || '').toLowerCase();
if (tab === 'incoming' || tab === 'outgoing') {
  next.set('section', 'progress');
  next.set('sub', tab);
} else if (tab === 'compose' || params.get('username')) {
  next.set('section', 'collectors');
} else {
  next.set('section', 'progress');
}
if (params.get('username')) next.set('username', params.get('username'));
if (params.get('offerId')) next.set('offerId', params.get('offerId'));
if (params.get('tradeId')) next.set('offerId', params.get('tradeId'));
['embed', 'shellBuild', 'shellLoad', 'shellRetry'].forEach((key) => {
  if (params.get(key)) next.set(key, params.get(key));
});
location.replace(`trade-lists.html?${next.toString()}`);
