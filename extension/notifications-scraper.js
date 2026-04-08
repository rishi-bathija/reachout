(function () {
  function normalizeProfileUrl(raw) {
    try {
      const url = new URL(raw)
      const path = url.pathname.replace(/\/$/, '')
      return `${url.origin}${path}`
    } catch {
      return ''
    }
  }

  function isAcceptanceText(text) {
    return /accepted your invitation/i.test(text || '')
  }

  function extractAcceptance(node) {
    const text = node.textContent || ''
    if (!isAcceptanceText(text)) return null

    const link = node.querySelector('a[href*="/in/"]')
    const profileUrl = link ? normalizeProfileUrl(link.href) : ''
    const name = link ? link.textContent.trim() : ''

    if (!profileUrl && !name) return null

    return { name, profileUrl }
  }

  function collectAcceptances() {
    let candidates = Array.from(
      document.querySelectorAll(
        'li.notification-item, .nt-card, .notifications__list-item, .notification-card, [data-test-id="notification-item"]'
      )
    )

    if (candidates.length === 0) {
      candidates = Array.from(document.querySelectorAll('li'))
    }

    const found = []
    const seen = new Set()

    for (const node of candidates) {
      const acceptance = extractAcceptance(node)
      if (!acceptance) continue
      const key = acceptance.profileUrl || acceptance.name
      if (!key || seen.has(key)) continue
      seen.add(key)
      found.push(acceptance)
    }

    return found
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== 'SCRAPE_ACCEPTANCES') return
    const acceptances = collectAcceptances()
    console.log('[ReachOutFlow] Notifications scraper found', acceptances)
    sendResponse({ acceptances })
    return true
  })
})()
