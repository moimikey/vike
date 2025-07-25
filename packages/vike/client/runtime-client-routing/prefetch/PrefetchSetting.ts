export type { PrefetchStaticAssets }
export type { PrefetchSetting }

type PrefetchSetting =
  // { staticAssets: 'hover', pageContext: false }
  | false
  // { staticAssets: 'hover', pageContext: true }
  | true
  | {
      staticAssets?: false | 'hover' | 'viewport'
      pageContext?: boolean | number
    }

// TO-DO/pageContext-prefetch: use and implement PrefetchSettingFuture
type PrefetchSettingValue = {
  staticAssets?:
    | false
    | 'hover'
    | 'viewport'
    | {
        when?: 'hover' | 'viewport'
        precedence?: number
      }
  pageContext?:
    | false
    | 'hover'
    | 'viewport'
    | {
        when?: 'hover' | 'viewport'
        maxAge?: number
        precedence?: number
      }
}
type PrefetchSettingFuture = PrefetchSettingValue & {
  links?: PrefetchSettingValue
}

// TO-DO/next-major-release: remove
type PrefetchStaticAssets = false | 'hover' | 'viewport'
