(function () {
  function normalizeCompany(value) {
    if (!value) return ''
    const cleaned = value.replace(/\s+/g, ' ').trim()
    return cleaned.split('·')[0]?.trim() || cleaned
  }

  function getProfileData() {
    const name = document.querySelector('h1')?.textContent?.trim() || ''
    const headline = document.querySelector('.text-body-medium')?.textContent?.trim() || ''
    const profileUrl = window.location.href.split('?')[0]
    const { role, company } = getCurrentRoleAndCompany(headline)

    return {
      name,
      role,
      company,
      profileUrl,
    }
  }

  function matchesConnectText(value) {
    if (!value) return false
    return /\bconnect\b/i.test(value)
  }

  function getCurrentCompanyFromTopCard() {
    const currentCompanyButton = document.querySelector('button[aria-label^="Current company:"]')
    if (!currentCompanyButton) return ''
    const label = currentCompanyButton.getAttribute('aria-label') || ''
    const match = label.match(/^Current company:\s*([^\.]+)\./i)
    if (match && match[1]) {
      return normalizeCompany(match[1].trim())
    }
    const text = currentCompanyButton.textContent || ''
    return normalizeCompany(text.trim())
  }

  function getCurrentRoleAndCompanyFromExperience() {
    const experienceAnchor = document.querySelector('#experience')
    const experienceSection = experienceAnchor?.closest('section')
    const firstItem = experienceSection?.querySelector('li.artdeco-list__item')
    if (!firstItem) return { role: '', company: '' }

    const roleSpans = Array.from(
      firstItem.querySelectorAll('div.display-flex.align-items-center.mr1.hoverable-link-text.t-bold span[aria-hidden="true"]')
    )

    const hasNestedRoles = Boolean(firstItem.querySelector('.pvs-entity__sub-components ul'))
    let role = ''
    let company = ''

    if (hasNestedRoles && roleSpans.length >= 2) {
      company = normalizeCompany(roleSpans[0]?.textContent?.trim() || '')
      role = roleSpans[1]?.textContent?.trim() || ''
    } else {
      role = roleSpans[0]?.textContent?.trim() || ''

      const companySpan = firstItem.querySelector('span.t-14.t-normal span[aria-hidden="true"]')
      const companyText = companySpan?.textContent?.trim() || ''
      company = normalizeCompany(companyText)
    }

    return { role, company }
  }

  function getCurrentRoleAndCompany(headlineFallback) {
    const topCompany = getCurrentCompanyFromTopCard()
    const fromExperience = getCurrentRoleAndCompanyFromExperience()

    const role = fromExperience.role || headlineFallback || ''
    const company = fromExperience.company || topCompany || ''

    return { role, company }
  }

  function isConnectTrigger(target, event) {
    const path = (event && typeof event.composedPath === 'function')
      ? event.composedPath()
      : [target]

    for (const node of path) {
      if (!(node instanceof Element)) continue
      const role = (node.getAttribute('role') || '').toLowerCase()
      const tag = node.tagName.toLowerCase()
      if (role === 'menuitem' || role === 'button' || tag === 'button' || tag === 'a') {
        const label = node.getAttribute('aria-label') || ''
        const text = node.textContent || ''
        if (matchesConnectText(label) || matchesConnectText(text)) {
          return true
        }
      }
    }

    return false
  }

  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    if (!isConnectTrigger(target, event)) return

    const payload = getProfileData()
    if (!payload.name) return

    try {
      chrome.runtime.sendMessage(
        {
          type: 'SET_PENDING_CONNECTION',
          payload,
          openPopup: true,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[ReachOutFlow] sendMessage failed', chrome.runtime.lastError)
            return
          }
          if (!response || !response.success) {
            console.warn('[ReachOutFlow] sendMessage response invalid', response)
          }
        }
      )
    } catch (error) {
      console.error('[ReachOutFlow] sendMessage exception', error)
    }
  })
})()
