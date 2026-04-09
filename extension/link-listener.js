(function () {
  const allowedOrigins = [window.location.origin]

  window.addEventListener('message', (event) => {
    if (!allowedOrigins.includes(event.origin)) {
      return
    }

    if (!event.data || event.data.type !== 'REACHOUTFLOW_EXTENSION_TOKEN') {
      return
    }

    const token = event.data.token
    if (!token) {
      return
    }

    chrome.storage.local.get(['config'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('[ReachOutFlow] storage.local.get failed', chrome.runtime.lastError)
        return
      }

      const apiUrl = result.config?.apiUrl || 'http://localhost:3000'
      fetch(`${apiUrl}/api/extension/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
        .then(async (confirmResponse) => {
          const data = await confirmResponse.json().catch(() => null)
          if (!confirmResponse.ok) {
            throw new Error(data?.error || `Confirm request failed with status ${confirmResponse.status}`)
          }

          chrome.runtime.sendMessage({ type: 'SET_TOKEN', token }, (sendResponse) => {
            if (chrome.runtime.lastError) {
              console.error('[ReachOutFlow] SET_TOKEN failed', chrome.runtime.lastError)
              return
            }
            if (!sendResponse || !sendResponse.success) {
              console.warn('[ReachOutFlow] SET_TOKEN response invalid', sendResponse)
              return
            }
          })
        })
        .catch((error) => {
          console.error('[ReachOutFlow] extension confirm failed', error)
        })
    })
  })
})()
