let config = {}
let pendingConnection = null

chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (response) => {
  if (response && response.success) {
    config = response.config
    chrome.storage.local.get(['pendingConnection'], (result) => {
      pendingConnection = result.pendingConnection || null
      updateUI()
    })
  }
})

function updateUI() {
  const statusContainer = document.getElementById('status-container')
  const linkView = document.getElementById('link-view')
  const linkedView = document.getElementById('linked-view')
  const pendingView = document.getElementById('pending-view')
  const noPendingView = document.getElementById('no-pending-view')

  const isLinked = Boolean(config.token)

  if (isLinked) {
    statusContainer.innerHTML = '<div class="status connected">Connected to ReachOutFlow</div>'
    linkView.style.display = 'none'
    linkedView.style.display = 'block'
    if (pendingConnection) {
      pendingView.style.display = 'block'
      noPendingView.style.display = 'none'
      document.getElementById('pending-name').value = pendingConnection.name || ''
      document.getElementById('pending-role').value = pendingConnection.role || ''
      document.getElementById('pending-company').value = pendingConnection.company || ''
      document.getElementById('pending-profile').value = pendingConnection.profileUrl || ''
      document.getElementById('pending-job-title').value = pendingConnection.jobTitle || ''
      document.getElementById('pending-job-url').value = pendingConnection.jobUrl || ''
      document.getElementById('pending-notes').value = pendingConnection.notes || ''
    } else {
      pendingView.style.display = 'none'
      noPendingView.style.display = 'block'
    }
  } else {
    statusContainer.innerHTML = '<div class="status disconnected">Not connected</div>'
    linkView.style.display = 'block'
    linkedView.style.display = 'none'

    if (config.apiUrl) {
      document.getElementById('api-url').value = config.apiUrl
    }
  }
}

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

document.getElementById('unlink-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({
    type: 'UPDATE_CONFIG',
    config: { token: null, linkedAt: null },
  }, () => {
    config.token = null
    config.linkedAt = null
    updateUI()
  })
})

document.getElementById('clear-pending-btn').addEventListener('click', () => {
  chrome.storage.local.remove(['pendingConnection'], () => {
    pendingConnection = null
    updateUI()
  })
})

document.getElementById('save-connection-btn').addEventListener('click', () => {
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

  fetch(`${apiUrl}/api/connections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({
      name,
      role,
      company,
      profileUrl: profileUrl || undefined,
      jobTitle: jobTitle || undefined,
      jobUrl: jobUrl || undefined,
      notes: notes || undefined,
    }),
  })
    .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) {
        throw new Error(data.error || 'Failed to save connection')
      }
      chrome.storage.local.remove(['pendingConnection'], () => {
        pendingConnection = null
        updateUI()
      })
    })
    .catch((error) => {
      alert(`Failed to save connection: ${error.message}`)
    })
})
