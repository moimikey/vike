import { handleSsr } from './ssr'
import { handleStaticAssets } from './static-assets'

addEventListener('fetch', (event) => {
  try {
    event.respondWith(
      handleFetchEvent(event).catch((err) => {
        console.error(err.stack)
      }),
    )
  } catch (err) {
    console.error(err.stack)
    event.respondWith(new Response('Internal Error', { status: 500 }))
  }
})

async function handleFetchEvent(event) {
  const { url } = event.request
  if (!isAssetUrl(url)) {
    const { headers } = event.request
    const response = await handleSsr(url, headers)
    if (response !== null) return response
  }
  const response = await handleStaticAssets(event)
  return response
}

function isAssetUrl(url) {
  const { pathname } = new URL(url)
  return pathname.startsWith('/assets/')
}
