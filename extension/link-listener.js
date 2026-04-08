(function () {
  window.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'REACHOUTFLOW_EXTENSION_TOKEN') {
      return
    }

    const token = event.data.token
    if (!token) {
      return
    }

    chrome.runtime.sendMessage({ type: 'SET_TOKEN', token }, () => {
      chrome.storage.local.get(['config'], (result) => {
        const apiUrl = result.config?.apiUrl || 'http://localhost:3000'
        fetch(`${apiUrl}/api/extension/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        }).catch(() => {
          // Ignore errors to keep linking resilient.
        })
      })
    })
  })
})()
