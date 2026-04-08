let config = {}
let pendingConnection = null
let existingConnections = []
let selectedSource = null
let lastCompanyQuery = ''
let companyFetchTimer = null
let savingConnection = false

function loadState() {
  chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (response) => {
    if (response && response.success) {
      config = response.config
      chrome.storage.local.get(['pendingConnection'], (result) => {
        pendingConnection = result.pendingConnection || null
        updateUI()
      })
    }
  })
}

function updateUI() {
  const statusContainer = document.getElementById('status-container')
  const linkingCard = document.getElementById('linking-card')
  const pendingCard = document.getElementById('pending-card')
  const emptyCard = document.getElementById('empty-card')
  const acceptanceCard = document.getElementById('acceptance-card')
  const reuseCard = document.getElementById('reuse-card')
  const reuseList = document.getElementById('reuse-list')
  const clearReuseBtn = document.getElementById('clear-reuse-btn')
  const saveBtn = document.getElementById('save-connection-btn')
  const accountCard = document.getElementById('account-card')

  const isLinked = Boolean(config.token)

  if (!isLinked) {
    statusContainer.innerHTML = '<div class="status disconnected">Not connected</div>'
    linkingCard.style.display = 'block'
    pendingCard.style.display = 'none'
    emptyCard.style.display = 'none'
    acceptanceCard.style.display = 'none'
    accountCard.style.display = 'none'

    if (config.apiUrl) {
      document.getElementById('api-url').value = config.apiUrl
    }
    return
  }

  statusContainer.innerHTML = '<div class="status connected">Connected to ReachOutFlow</div>'
  linkingCard.style.display = 'none'
  acceptanceCard.style.display = 'block'
  accountCard.style.display = 'block'

  if (pendingConnection) {
    pendingCard.style.display = 'block'
    emptyCard.style.display = 'none'

    document.getElementById('pending-name').value = pendingConnection.name || ''
    document.getElementById('pending-role').value = pendingConnection.role || ''
    document.getElementById('pending-company').value = pendingConnection.company || ''
    document.getElementById('pending-profile').value = pendingConnection.profileUrl || ''
    document.getElementById('pending-job-title').value = pendingConnection.jobTitle || ''
    document.getElementById('pending-job-url').value = pendingConnection.jobUrl || ''
    document.getElementById('pending-notes').value = pendingConnection.notes || ''

    if (selectedSource) {
      document.getElementById('pending-job-title').value = selectedSource.jobTitle || ''
      document.getElementById('pending-job-url').value = selectedSource.jobUrl || ''
      document.getElementById('pending-notes').value = selectedSource.notes || ''
      clearReuseBtn.style.display = 'block'
    } else {
      clearReuseBtn.style.display = 'none'
    }

    const companyValue = document.getElementById('pending-company').value.trim()
    const normalizedCompany = companyValue.split('·')[0].trim()
    if (normalizedCompany.length >= 2) {
      scheduleFetchExistingConnections(normalizedCompany)
    } else {
      existingConnections = []
      reuseCard.style.display = 'none'
      reuseList.innerHTML = ''
    }

    if (existingConnections.length > 0) {
      reuseCard.style.display = 'block'
      reuseList.innerHTML = existingConnections
        .map((conn) => {
          const jobTitle = conn.jobTitle ? ` (${conn.jobTitle})` : ''
          return `
            <div style="display:flex; justify-content: space-between; align-items:center; gap:8px;">
              <div style="font-size:12px;">
                <div style="font-weight:600;">${conn.name}${jobTitle}</div>
                <div style="color:#6b7280;">${conn.company}</div>
              </div>
              <button class="reuse-btn" data-id="${conn.id}" style="width:auto; padding:6px 10px; font-size:12px;">Use</button>
            </div>
          `
        })
        .join('')
    } else {
      reuseCard.style.display = 'none'
      reuseList.innerHTML = ''
    }

    if (saveBtn) {
      saveBtn.disabled = savingConnection
      saveBtn.textContent = savingConnection ? 'Adding...' : 'Save Connection'
    }
  } else {
    pendingCard.style.display = 'none'
    emptyCard.style.display = 'block'
    reuseCard.style.display = 'none'
    reuseList.innerHTML = ''
    if (saveBtn) {
      saveBtn.disabled = true
      saveBtn.textContent = 'Save Connection'
    }
  }
}

function scheduleFetchExistingConnections(company) {
  if (!config.token || !config.apiUrl) return
  if (company === lastCompanyQuery) return
  lastCompanyQuery = company

  if (companyFetchTimer) {
    clearTimeout(companyFetchTimer)
  }

  companyFetchTimer = setTimeout(() => {
    fetchExistingConnections(company)
  }, 400)
}

function fetchExistingConnections(company) {
  fetch(`${config.apiUrl}/api/connections?company=${encodeURIComponent(company)}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  })
    .then((response) => response.json())
    .then((data) => {
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data.data)
          ? data.data
          : (data.items || [])
      existingConnections = list
      updateUI()
    })
    .catch(() => {
      existingConnections = []
      updateUI()
    })
}

document.addEventListener('DOMContentLoaded', () => {
  loadState()

  document.getElementById('open-link-btn').addEventListener('click', () => {
    const apiUrl = document.getElementById('api-url').value.trim()
    if (!apiUrl) {
      alert('Please set API URL')
      return
    }

    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      config: { apiUrl },
    })

    const linkUrl = `${apiUrl}/dashboard/extension`
    chrome.tabs.create({ url: linkUrl })
  })

  document.getElementById('save-token-btn').addEventListener('click', () => {
    const apiUrl = document.getElementById('api-url').value.trim()
    const token = document.getElementById('token-input').value.trim()

    if (!apiUrl || !token) {
      alert('API URL and token are required')
      return
    }

    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      config: { apiUrl },
    })

    chrome.runtime.sendMessage({ type: 'SET_TOKEN', token }, () => {
      fetch(`${apiUrl}/api/extension/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).finally(() => {
        config.apiUrl = apiUrl
        config.token = token
        updateUI()
      })
    })
  })

  document.getElementById('clear-pending-btn').addEventListener('click', () => {
    chrome.storage.local.remove(['pendingConnection'], () => {
      pendingConnection = null
      selectedSource = null
      existingConnections = []
      updateUI()
    })
  })

  document.getElementById('save-connection-btn').addEventListener('click', () => {
    if (savingConnection) return
    if (!config.token) {
      alert('Extension is not connected yet.')
      return
    }

    const apiUrlInput = document.getElementById('api-url')
    const apiUrl = (apiUrlInput ? apiUrlInput.value.trim() : '') || config.apiUrl
    const name = document.getElementById('pending-name').value.trim()
    const role = document.getElementById('pending-role').value.trim()
    const company = document.getElementById('pending-company').value.trim()
    const profileUrl = document.getElementById('pending-profile').value.trim()
    const jobTitle = document.getElementById('pending-job-title').value.trim()
    const jobUrl = document.getElementById('pending-job-url').value.trim()
    const notes = document.getElementById('pending-notes').value.trim()

    if (!apiUrl) {
      alert('API URL is required.')
      return
    }

    if (!name || !role || !company) {
      alert('Name, role, and company are required.')
      return
    }

    const payload = selectedSource
      ? {
        name,
        role,
        profileUrl: profileUrl || undefined,
        sourceConnectionId: selectedSource.id,
      }
      : {
        name,
        role,
        company,
        profileUrl: profileUrl || undefined,
        jobTitle: jobTitle || undefined,
        jobUrl: jobUrl || undefined,
        notes: notes || undefined,
      }

    savingConnection = true
    updateUI()

    fetch(`${apiUrl}/api/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(payload),
    })
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          throw new Error(data.error || 'Failed to save connection')
        }
        chrome.storage.local.remove(['pendingConnection'], () => {
          pendingConnection = null
          selectedSource = null
          savingConnection = false
          updateUI()
        })
      })
      .catch((error) => {
        savingConnection = false
        updateUI()
        alert(`Failed to save connection: ${error.message}`)
      })
  })

  document.getElementById('reuse-list').addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (!target.classList.contains('reuse-btn')) return
    const id = target.getAttribute('data-id')
    if (!id) return
    const match = existingConnections.find((conn) => conn.id === id)
    if (!match) return
    selectedSource = match
    updateUI()
  })

  document.getElementById('clear-reuse-btn').addEventListener('click', () => {
    selectedSource = null
    updateUI()
  })

  document.getElementById('check-acceptances-btn').addEventListener('click', () => {
    console.log('[ReachOutFlow] Check acceptances clicked')
    const statusEl = document.getElementById('acceptance-status')
    const listEl = document.getElementById('acceptance-list')
    statusEl.style.display = 'block'
    statusEl.className = 'status'
    statusEl.textContent = 'Checking LinkedIn notifications...'
    listEl.innerHTML = ''

    chrome.runtime.sendMessage({ type: 'CHECK_ACCEPTANCES' }, (response) => {
      console.log('[ReachOutFlow] Acceptances response', response)
      if (!response || !response.success) {
        statusEl.className = 'status disconnected'
        statusEl.textContent = response?.error || 'Failed to check acceptances'
        return
      }

      const updated = response.updated || 0
      const matched = response.matched || 0
      statusEl.className = 'status connected'
      statusEl.textContent = `Matched ${matched} acceptance(s), updated ${updated}.`

      const matchedConnections = response.matchedConnections || []
      if (!matchedConnections.length) {
        listEl.innerHTML = ''
        return
      }

      listEl.innerHTML = matchedConnections
        .map((item) => {
          const name = item.name || 'Unknown'
          const url = item.profileUrl || ''
          return `
            <li style="margin-bottom: 6px; font-size: 12px; display:flex; justify-content: space-between; align-items:center; gap:8px;">
              <span>${name}${url ? ` - ${url}` : ''}</span>
              <button class="reply-btn" data-id="${item.id}" style="width:auto; padding:4px 8px; font-size:12px;">Reply</button>
            </li>
          `
        })
        .join('')
    })
  })

  document.getElementById('acceptance-list').addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (!target.classList.contains('reply-btn')) return
    const id = target.getAttribute('data-id')
    if (!id) return
    const apiUrl = config.apiUrl || document.getElementById('api-url')?.value?.trim()
    if (!apiUrl) {
      alert('API URL is required.')
      return
    }
    chrome.tabs.create({ url: `${apiUrl}/dashboard/connections/${id}` })
  })

  document.getElementById('relink-btn').addEventListener('click', () => {
    const apiUrl = config.apiUrl || document.getElementById('api-url')?.value?.trim()
    if (!apiUrl) {
      alert('API URL is required.')
      return
    }
    chrome.tabs.create({ url: `${apiUrl}/dashboard/extension` })
  })

  document.getElementById('unlink-btn').addEventListener('click', () => {
    chrome.storage.local.set({ config: { ...config, token: null, linkedAt: null } }, () => {
      config.token = null
      config.linkedAt = null
      updateUI()
    })
  })

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return
    if (changes.pendingConnection) {
      pendingConnection = changes.pendingConnection.newValue || null
      updateUI()
    }
    if (changes.config) {
      config = changes.config.newValue || config
      updateUI()
    }
  })
})
