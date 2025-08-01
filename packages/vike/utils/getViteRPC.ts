export { getViteRPC } // consumer (aka RPC client)
export { createViteRPC } // provider (aka RPC server)

import type { ViteDevServer } from 'vite'
import { assert } from './assert.js'
import { genPromise } from './genPromise.js'
import { getRandomId } from './getRandomId.js'
import { getGlobalObject } from './getGlobalObject.js'
import { createDebugger } from './debug.js'
import { assertIsNotBrowser } from './assertIsNotBrowser.js'
assertIsNotBrowser()
const globalObject = getGlobalObject('utils/getViteRPC.ts', {
  rpc: null as null | object,
})
const debug = createDebugger('vike:vite-rpc')

type DataRequest = { callId: string; functionName: string; functionArgs: unknown[] }
type DataResponse = { callId: string; functionReturn: unknown }

function getViteRPC<RpcFunctions>() {
  globalObject.rpc ??= createRpcClient()
  return globalObject.rpc as RpcFunctions
}

function createRpcClient() {
  // @ts-ignore CJS build doesn't support import.meta — TO-DO/eventually: let's remove this ts-ignore after we removed the CJS build
  const hot = import.meta.hot
  assert(hot)

  const listeners: { callId: string; cb: (ret: unknown) => void }[] = []
  hot.on(`vike:rpc:response`, (dataResponse: DataResponse) => {
    if (debug.isActivated) debug('Response received', dataResponse)
    const { callId, functionReturn } = dataResponse
    listeners.forEach((l) => {
      if (callId !== l.callId) return
      l.cb(functionReturn)
      listeners.splice(listeners.indexOf(l), 1)
    })
  })

  const rpc = new Proxy(
    {},
    {
      get(_, functionName: string) {
        return async (...functionArgs: unknown[]) => {
          // @ts-ignore CJS build doesn't support import.meta — TO-DO/eventually: let's remove this ts-ignore after we removed the CJS build
          const hot = import.meta.hot
          assert(hot)
          const callId = getRandomId()

          const { promise, resolve } = genPromise<unknown>({ timeout: 3 * 1000 })
          listeners.push({
            callId,
            cb: (functionReturn: unknown) => {
              resolve(functionReturn)
            },
          })

          const dataRequest: DataRequest = { callId, functionName, functionArgs }
          if (debug.isActivated) debug('Request sent', dataRequest)
          // Vite's type is wrong: import.meta.hot.send() does seem to return a promise
          await hot.send('vike:rpc:request', dataRequest)

          const functionReturn = await promise
          return functionReturn
        }
      },
    },
  )

  return rpc
}

type AsyncFunction = (...args: any[]) => Promise<unknown>
function createViteRPC(
  viteDevServer: ViteDevServer,
  getRpcFunctions: (viteDevServer: ViteDevServer) => Record<string, AsyncFunction>,
) {
  const rpcFunctions = getRpcFunctions(viteDevServer)
  const { environments } = viteDevServer
  for (const envName in environments) {
    debug('Listening to environment', envName)
    const env = environments[envName]!
    env.hot.on('vike:rpc:request', async (dataRequest: DataRequest) => {
      if (debug.isActivated) debug('Request received', dataRequest)
      const { callId, functionName, functionArgs } = dataRequest

      const functionReturn = await rpcFunctions[functionName]!(...functionArgs)

      const dataResponse: DataResponse = { callId, functionReturn }
      if (debug.isActivated) debug('Response sent', dataResponse)
      env.hot.send('vike:rpc:response', dataResponse)
    })
  }
}
