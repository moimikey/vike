export { preparePageContextForPublicUsage }
export { assertPropertyGetters }
export type { PageContextPrepareMinimum }

import { assert, assertWarning, compareString, isPropertyGetter } from './utils.js'
import { addIs404ToPageProps } from './addIs404ToPageProps.js'
import {
  type GlobalContextPrepareMinimum,
  prepareGlobalContextForPublicUsage,
} from './prepareGlobalContextForPublicUsage.js'
import { getProxyForPublicUsage } from './getProxyForPublicUsage.js'

type PageContextPrepareMinimum = {
  _isOriginalObject: true
  isPageContext: true
  _globalContext: GlobalContextPrepareMinimum
}

function preparePageContextForPublicUsage<PageContext extends PageContextPrepareMinimum>(pageContext: PageContext) {
  assert(!(pageContext as Record<string, unknown>)._isProxyObject)
  assert(!(pageContext as Record<string, unknown>).globalContext) // pageContext.globalContext should only be available to users — Vike itself should use pageContext._globalContext instead
  assert(pageContext._isOriginalObject) // ensure we preserve the original object reference

  addIs404ToPageProps(pageContext)

  // TO-DO/next-major-release: remove
  if (!('_pageId' in pageContext)) {
    Object.defineProperty(pageContext, '_pageId', {
      get() {
        assertWarning(false, 'pageContext._pageId has been renamed to pageContext.pageId', {
          showStackTrace: true,
          onlyOnce: true,
        })
        return (pageContext as any).pageId
      },
      enumerable: false,
    })
  }

  // For a more readable `console.log(pageContext)` output
  sortPageContext(pageContext)

  const globalContextPublic = prepareGlobalContextForPublicUsage(pageContext._globalContext)
  const pageContextPublic = getProxyForPublicUsage(
    pageContext,
    'pageContext',
    // We must skip it in the client-side because of the reactivity mechanism of UI frameworks like Solid.
    // - TO-DO/soon/proxy: double check whether that's true
    true,
    (prop) => {
      if (prop === 'globalContext') {
        return globalContextPublic
      }
      if (prop in globalContextPublic) {
        return (globalContextPublic as Record<string | symbol, unknown>)[prop]
      }
    },
  )
  return pageContextPublic
}

// Sort `pageContext` keys alphabetically, in order to make reading the `console.log(pageContext)` output easier
function sortPageContext(pageContext: Record<string, unknown>): void {
  let descriptors = Object.getOwnPropertyDescriptors(pageContext)
  for (const key of Object.keys(pageContext)) delete pageContext[key]
  descriptors = Object.fromEntries(Object.entries(descriptors).sort(([key1], [key2]) => compareString(key1, key2)))
  Object.defineProperties(pageContext, descriptors)
}

function assertPropertyGetters(pageContext: Record<string, unknown>) {
  /*
  If the isPropertyGetter() assertions fail then it's most likely because Object.assign() was used instead of `objectAssign()`:
  ```js
  const PageContextUrlComputed = getPageContextUrlComputed(pageContext)

  // ❌ Breaks the property descriptors/getters of pageContext defined by getPageContextUrlComputed() such as pageContext.urlPathname
  Object.assign(pageContext, pageContextUrlComputed)

  // ❌ Also breaks property descriptors/getters
  const pageContext = { ...pageContextUrlComputed }

  // ✅ Preserves property descriptors/getters (see objectAssign() implementation)
  objectAssign(pageContext, pageContextUrlComputed)
  ```
  */
  ;[
    'urlPathname',
    // TO-DO/next-major-release: remove
    'urlParsed',
    // TO-DO/next-major-release: remove
    'url',
    // TO-DO/next-major-release: remove
    'pageExports',
  ].forEach((prop) => {
    if (pageContext.prop) assert(isPropertyGetter(pageContext, prop))
  })
}
