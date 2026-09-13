const apiBase = (process.env.PAWRADAR_API_URL || 'http://localhost:5000/api').replace(/\/$/, '')

async function check(path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Origin: 'http://localhost:3000' },
    signal: AbortSignal.timeout(10_000),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body)}`)
  }
  console.log(`PASS ${path} (${response.status})`)
  return body
}

try {
  const health = await check('/health')
  if (health?.db !== 'connected') throw new Error('Database is not connected')
  await check('/pets')
  console.log('PawRadar API smoke test passed.')
} catch (error) {
  console.error(`PawRadar API smoke test failed: ${error.message}`)
  process.exitCode = 1
}
