const query = new URLSearchParams(location.search)
if (query.get('open') === 'storage' || query.get('account') === 'reset') {
  document.querySelector('main')?.setAttribute('hidden', '')
  document.querySelector('footer')?.setAttribute('hidden', '')
  document.querySelector('#root')?.removeAttribute('hidden')
  void import('./main')
}
