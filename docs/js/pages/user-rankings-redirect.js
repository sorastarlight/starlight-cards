const params = new URLSearchParams(location.search);
params.set('section', 'collectors');
location.replace(`trade-lists.html?${params.toString()}`);
