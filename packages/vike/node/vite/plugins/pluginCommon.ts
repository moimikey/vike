export { pluginCommon }

import { type InlineConfig, type Plugin, type ResolvedConfig, type UserConfig } from 'vite'
import {
  assert,
  assertUsage,
  assertWarning,
  findPackageJson,
  hasProp,
  isDevCheck,
  isDocker,
  isObject,
  isVitest,
} from '../utils.js'
import { assertRollupInput } from './pluginBuild/pluginBuildConfig.js'
import { installRequireShim_setUserRootDir } from '@brillout/require-shim'
import pc from '@brillout/picocolors'
import path from 'node:path'
import { assertResolveAlias } from './pluginCommon/assertResolveAlias.js'
import { isViteCliCall } from '../shared/isViteCliCall.js'
import { isVikeCliOrApi } from '../../api/context.js'
import { getVikeConfigInternal, setVikeConfigContext } from '../shared/resolveVikeConfigInternal.js'
import { assertViteRoot, getViteRoot, normalizeViteRoot } from '../../api/prepareViteApiCall.js'
import { temp_disablePrerenderAutoRun } from '../../prerender/context.js'
import type { VitePluginServerEntryOptions } from '@brillout/vite-plugin-server-entry/plugin'
const pluginName = 'vike:pluginCommon'

declare module 'vite' {
  interface UserConfig {
    vitePluginServerEntry?: VitePluginServerEntryOptions
    _isDev?: boolean
    _rootResolvedEarly?: string
    _baseViteOriginal?: string
    // We'll be able to remove once we have one Rolldown build instead of two Rollup builds
    _viteConfigFromUserEnhanced?: InlineConfig
  }
}

declare global {
  var __VIKE__IS_PROCESS_SHARED_WITH_VITE: undefined | true
}
globalThis.__VIKE__IS_PROCESS_SHARED_WITH_VITE = true

function pluginCommon(vikeVitePluginOptions: unknown): Plugin[] {
  return [
    {
      name: `${pluginName}:pre`,
      enforce: 'pre',
      config: {
        order: 'pre',
        async handler(configFromUser, env) {
          const isDev = isDevCheck(env)
          const operation = env.command === 'build' ? 'build' : env.isPreview ? 'preview' : 'dev'
          const rootResolvedEarly = configFromUser.root
            ? normalizeViteRoot(configFromUser.root)
            : await getViteRoot(operation)
          assert(rootResolvedEarly)
          // TO-DO/next-major-release: we can remove setVikeConfigContext() call here since with Vike's CLI it's already called at vike/node/api/prepareViteApiCall.ts
          setVikeConfigContext({ userRootDir: rootResolvedEarly, isDev, vikeVitePluginOptions })
          const vikeConfig = await getVikeConfigInternal()
          return {
            _isDev: isDev,
            _rootResolvedEarly: rootResolvedEarly,
            // TO-DO/next-major-release: remove https://github.com/vikejs/vike/issues/2122
            configVikePromise: Promise.resolve({
              prerender: vikeConfig.prerenderContext.isPrerenderingEnabled,
            }),
          }
        },
      },
    },
    {
      name: pluginName,
      configResolved(config) {
        assertViteRoot(config._rootResolvedEarly!, config)
        assertSingleInstance(config)
        installRequireShim_setUserRootDir(config.root)
      },
    },
    {
      name: `${pluginName}:post`,
      enforce: 'post',
      configResolved: {
        order: 'post',
        async handler(config) {
          /* Also externalize linked dependencies by default?
           * - Can this be done while the user sets ssr.external to `string[]`? I guess not?
           *   - If not then it's a problem: it makes the default inconsistent.
           * - https://vite.dev/config/ssr-options.html#ssr-external
           * - New setting +transpileLinkedDependencies ?
          overrideViteDefaultSsrExternal(config)
          //*/
          workaroundCI(config)
          assertRollupInput(config)
          assertResolveAlias(config)
          assertEsm(config.root)
          assertVikeCliOrApi(config)
          temp_supportOldInterface(config)
          await emitServerEntryOnlyIfNeeded(config)
        },
      },
      config: {
        order: 'post',
        async handler(configFromUser) {
          let configFromVike: UserConfig = { server: {}, preview: {} }
          const vikeConfig = await getVikeConfigInternal()

          if (vikeConfig.config.port !== undefined) {
            // https://vike.dev/port
            setDefault('port', vikeConfig.config.port, configFromUser, configFromVike)
          } else {
            // Change Vite's default port
            setDefault('port', 3000, configFromUser, configFromVike)
          }

          if (vikeConfig.config.host) {
            // https://vike.dev/host
            setDefault('host', vikeConfig.config.host, configFromUser, configFromVike)
          } else if (isDocker()) {
            // Set `--host` for Docker/Podman
            setDefault('host', true, configFromUser, configFromVike)
          }

          return configFromVike
        },
      },
    },
  ]
}

// Override Vite's default value without overriding user settings
function setDefault<Setting extends 'port' | 'host'>(
  setting: Setting,
  value: NonNullable<UserConfig['server'] | UserConfig['preview']>[Setting],
  configFromUser: UserConfig,
  configFromVike: UserConfig,
) {
  if (configFromUser.server?.[setting] === undefined) configFromVike.server![setting] = value
  if (configFromUser.preview?.[setting] === undefined) configFromVike.preview![setting] = value
}

/*
import { version } from 'vite'
function overrideViteDefaultSsrExternal(config: ResolvedConfig) {
  if (!isVersionOrAbove(version, '5.0.12')) return
  // @ts-ignore Not released yet: https://github.com/vitejs/vite/pull/10939/files#diff-5a3d42620df2c6b17e25f440ffdb67683dee7ef57317674d19f41d5f30502310L5
  config.ssr.external ??= true
}
//*/

// Workaround GitHub Action failing to access the server
function workaroundCI(config: ResolvedConfig) {
  if (process.env.CI) {
    config.server.host ??= true
    config.preview.host ??= true
  }
}

function assertEsm(userViteRoot: string) {
  const found = findPackageJson(userViteRoot)
  if (!found) return
  const { packageJson, packageJsonPath } = found
  let dir = path.posix.dirname(packageJsonPath)
  if (dir !== '/') {
    assert(!dir.endsWith('/'))
    dir = dir + '/'
  }
  assert(dir.endsWith('/'))
  dir = pc.dim(dir)
  assertWarning(
    packageJson.type === 'module',
    `We recommend setting ${dir}package.json#type to "module", see https://vike.dev/CJS`,
    { onlyOnce: true },
  )
}

function assertSingleInstance(config: ResolvedConfig) {
  const numberOfInstances = config.plugins.filter((o) => o.name === pluginName).length
  assertUsage(
    numberOfInstances === 1,
    `Vike's Vite plugin (${pc.cyan(
      "import vike from 'vike/plugin'",
    )}) is being added ${numberOfInstances} times to the list of Vite plugins. Make sure to add it only once instead.`,
  )
}

function assertVikeCliOrApi(config: ResolvedConfig) {
  if (isVikeCliOrApi()) return
  if (isViteCliCall()) {
    assert(!isVitest())
    assertWarning(false, `Vite's CLI is deprecated ${pc.underline('https://vike.dev/migration/cli')}`, {
      onlyOnce: true,
    })
    return
  }
  if (isVitest()) {
    assertWarning(
      false,
      `Unexpected Vitest setup: you seem to be using Vitest together with Vike's Vite plugin but without using Vike's JavaScript API which is unexpected, see ${pc.underline('https://vike.dev/vitest')}`,
      { onlyOnce: true },
    )
    return
  }
  if (config.server.middlewareMode) {
    assertWarning(
      false,
      `${pc.cyan('vite.createServer()')} is deprecated ${pc.underline('https://vike.dev/migration/cli#api')}`,
      {
        onlyOnce: true,
      },
    )
    return
  }
  assertWarning(false, `Vite's JavaScript API is deprecated ${pc.underline('https://vike.dev/migration/cli#api')}`, {
    onlyOnce: true,
  })
}

// TO-DO/next-major-release: remove https://github.com/vikejs/vike/issues/2122
function temp_supportOldInterface(config: ResolvedConfig) {
  if (!('vitePluginSsr' in config)) return
  assert(isObject(config.vitePluginSsr))
  if (hasProp(config.vitePluginSsr, 'prerender', 'object')) {
    assert(hasProp(config.vitePluginSsr.prerender, 'disableAutoRun', 'boolean'))
    if (config.vitePluginSsr.prerender.disableAutoRun) {
      temp_disablePrerenderAutoRun()
    }
    return
  }
  if (hasProp(config.vitePluginSsr, 'disableAutoFullBuild')) {
    if (config.vitePluginSsr.disableAutoFullBuild) {
      assert(config.vitePluginSsr.disableAutoFullBuild === 'prerender')
      temp_disablePrerenderAutoRun()
    }
    return
  }
  assert(false)
}

// Only emit dist/server/entry.mjs if necessary
async function emitServerEntryOnlyIfNeeded(config: ResolvedConfig) {
  const vikeConfig = await getVikeConfigInternal()
  if (config.vitePluginServerEntry?.inject && !vikeConfig.prerenderContext.isPrerenderingEnabled) {
    config.vitePluginServerEntry.disableServerEntryEmit = true
  }
}
