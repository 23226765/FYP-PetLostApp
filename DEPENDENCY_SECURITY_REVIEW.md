# Dependency security repair — 12 October 2026

## Scope and audit results

Focused dependency patches only. Existing uncommitted managed-image work was preserved. No major upgrades, overrides, advisory suppression, `audit fix --force`, environment changes, live Cloudinary calls, Atlas access, migrations, seeds or application cleanup commands were used.

Counts below are npm's **affected package entries**, including parent packages attributed their dependencies' advisories; they are not counts of independent vulnerabilities.

| Tree | Before, full audit | After, full audit | After, production-only audit |
|---|---|---|---|
| Root | 8: 5 high, 3 moderate | 3 moderate | 0 |
| Server | 8: 1 critical, 4 high, 3 moderate | 3 high | 0 |

Both full and `--omit=dev` audits were run; the remaining development advisories are deliberately visible. Zero npm runtime findings does not establish that the entire application is vulnerability-free.

## Advisory review: runtime and shared dependencies

| Package / advisory | Affected range in fresh audit | Dependency path and app relevance | Resolution |
|---|---|---|---|
| [proxy-addr: mapped IPv6 proxy trust](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | `>=1.1.0 <2.0.8` | Server → Express → proxy-addr. `req.ip` is used by rate limits and audit logging. Proxy trust is off by default, but deployed subnet configurations can expose this bug. | 2.0.8; real HTTP regression rejects spoofed forwarded IP/protocol with the advisory's short mapped subnet. |
| [qs: comma array-limit bypass](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) | `>=6.14.2 <=6.15.3` | Server → Express / body-parser → qs. Used for query/form parsing. App does not enable the advisory's `comma: true` configuration. | 6.16.0; small-input regression verifies the limit is enforced. |
| [qs: non-callable isBuffer](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) | `>=2.2.5 <6.16.0` | Same runtime path. Exact exploit requires parse→stringify with preserved constructor keys; no direct app round-trip was found. | 6.16.0; advisory's synthetic round-trip no longer throws. |
| [Vue SSR attribute-name XSS](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6) | `@vue/server-renderer <3.5.42` | Root → Vue / test-utils → server-renderer. App uses client-side Vue, not a production SSR server; installed dependency still patched. | Vue family 3.5.43; carriage-return attribute regression passes. |
| [source-map-js: indexed-offset denial of service](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | `>=1.0.0 <1.2.2` | Root → Vue compiler, vue-i18n message compiler, Vite/PostCSS and jsdom/css-tree. No app endpoint accepts source maps; practical exposure is chiefly build/debug processing. | 1.2.2. |

Express 4.22.2 and body-parser 1.20.6 were additionally flagged through their `qs` dependencies. Express 4.22.3 and body-parser 1.20.8 support fixed qs 6.16.0 through their normal dependency ranges.

### Axios advisory review

All twelve fresh Axios advisories are fixed by 1.20.0. The app uses Axios in its **browser API client**, including multipart image submissions, not as a backend HTTP/2 or proxy client. Prototype-pollution gadgets require a pollution source outside Axios; none was introduced or intentionally left in the app by this repair. A real Axios default-request regression with an isolated adapter verifies inherited `Object.prototype.method` cannot choose the HTTP method.

| Advisory | Affected range | Relevance |
|---|---|---|
| [Fetch outbound-request gadget](https://github.com/advisories/GHSA-vh66-26gq-q6x8) | `>=1.7.0 <1.20.0` | Browser/fetch configuration integrity if another source pollutes prototypes. |
| [Default-instance method gadget](https://github.com/advisories/GHSA-9fr6-4gfg-395g) | `>=1.0.0 <1.20.0` | Directly relevant to default API-client behavior; regression added. |
| [data URI parser ReDoS](https://github.com/advisories/GHSA-c29m-xwm3-cm6r) | `>=1.16.1 <1.20.0` | Node adapter path, not the deployed browser API transport. |
| [Proxy-host normalization ReDoS](https://github.com/advisories/GHSA-mghh-pgcx-3jjj) | `>=1.15.0 <1.20.0` | Node proxy/redirect path, not used by the backend. |
| [toFormData options gadget](https://github.com/advisories/GHSA-x97p-jq2g-jp4f) | `>=1.15.1 <1.20.0` | Related to form/multipart request handling; existing upload regressions passed. |
| [HTTP/2 DNS/proxy bypass](https://github.com/advisories/GHSA-3pq3-5fj3-cg6v) | `>=1.13.0 <1.20.0` | Backend does not use Axios HTTP/2. |
| [HTTP/2 session error DoS](https://github.com/advisories/GHSA-542g-h47m-68v8) | `>=1.13.0 <1.20.0` | Backend does not use Axios HTTP/2. |
| [Inherited headers after interceptor](https://github.com/advisories/GHSA-j8rh-479h-cp32) | `>=1.0.0 <1.20.0` | Relevant to request header/session integrity if pollution occurs. |
| [Inherited FormData getHeaders](https://github.com/advisories/GHSA-4hqw-qxg8-jxx2) | `>=1.12.0 <1.20.0` | Multipart/fetch header handling; existing frontend and API image regressions passed. |
| [Inherited createConnection](https://github.com/advisories/GHSA-m8m8-qj5v-23w3) | `>=1.15.2 <1.20.0` | Node socket path, not used by the browser client or backend. |
| [NO_PROXY CIDR bypass](https://github.com/advisories/GHSA-44g4-m2mj-wpvx) | `>=1.15.0 <1.20.0` | Node proxy configuration, not the deployed API transport. |
| [Fetch redirect policy bypass](https://github.com/advisories/GHSA-r4gj-5m52-g5wh) | `>=1.17.0 <1.20.0` | Fetch request policy; app API addresses are fixed backend-relative routes, not arbitrary user destinations. |

## Development dependencies

| Advisory/path | Affected range | Resolution or remaining exposure |
|---|---|---|
| [brace-expansion quadratic rewrite](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | `>=4.0.0 <5.0.12` | Both trees → minimatch → brace-expansion. Updated 5.0.9→5.0.12 in each tree, through parent-supported ranges. |
| [brace-expansion nested groups](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | `>=4.0.0 <5.0.11` | Same fix. Patterns originate from local tooling/configuration rather than public requests. |
| [brace-expansion comma recursion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | `>=4.0.0 <5.0.10` | Same fix. No major upgrade or override needed. |
| [braces stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | `<=3.0.3`; no published patched version | Server → nodemon 3.1.14 → chokidar 3.6.0 → braces 3.0.3. Three high npm entries arise from this one advisory. Local development watch patterns are the exposure; production `npm start` runs `node index.js`, not nodemon. Keep untrusted patterns/projects away from the watcher. No downgraded nodemon 1.14.10 or chokidar major override was applied. Future upstream fix or watcher replacement requires a separate decision. |
| [uuid buffer bounds](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | `<11.1.1` (also affected newer ranges, not installed) | Root → Capacitor CLI 8.5.1 → xcode 3.0.1 → uuid 7.0.3. Three moderate npm entries arise from this one advisory. Installed xcode source calls `uuid.v4()` without output buffers; affected methods are v3/v5/v6. No web runtime exposure identified. Latest reviewed CLI 8.5.3 still uses xcode 3; npm's suggested 8.4.3 downgrade removes xcode but is not a verified native-toolchain repair. No UUID major override/downgrade was applied. Revisit a supported upstream fix or separately approved major dependency change before native packaging. |

## Exact installed version changes

| Tree | Package | Before | After |
|---|---|---|---|
| Root | axios | 1.19.0 | 1.20.0 |
| Root | vue | 3.5.41 | 3.5.43 |
| Root | @vue/compiler-core | 3.5.41 | 3.5.43 |
| Root | @vue/compiler-dom | 3.5.41 | 3.5.43 |
| Root | @vue/compiler-sfc | 3.5.41 | 3.5.43 |
| Root | @vue/compiler-ssr | 3.5.41 | 3.5.43 |
| Root | @vue/reactivity | 3.5.41 | 3.5.43 |
| Root | @vue/runtime-core | 3.5.41 | 3.5.43 |
| Root | @vue/runtime-dom | 3.5.41 | 3.5.43 |
| Root | @vue/server-renderer | 3.5.41 | 3.5.43 |
| Root | @vue/shared | 3.5.41 | 3.5.43 |
| Root | source-map-js | 1.2.1 | 1.2.2 |
| Root | brace-expansion | 5.0.9 | 5.0.12 |
| Root | postcss | 8.5.26 | 8.5.29 |
| Root | nanoid | 3.3.18 | 3.3.20 |
| Server | express | 4.22.2 | 4.22.3 |
| Server | body-parser | 1.20.6 | 1.20.8 |
| Server | proxy-addr | 2.0.7 | 2.0.8 |
| Server | qs | 6.15.3 | 6.16.0 |
| Server | brace-expansion | 5.0.9 | 5.0.12 |

Vue's packages are kept at matching versions. PostCSS/nanoid updates are coupled requirements, not unrelated upgrades: compiler-sfc 3.5.43 requires PostCSS `^8.5.28`, and the resolved PostCSS requires nanoid `^3.3.19`. Direct manifest minimums are Axios `^1.20.0`, Vue `^3.5.42`, and Express `^4.22.3`; both lockfiles were updated through npm. Every other locked package version is unchanged, and no package path was added or removed after the targeted updates completed.

## Verification and limitations

- Root `npm ci --ignore-scripts` succeeded. Backend clean reinstall was declined and was not retried; installed required backend dependency versions were instead checked against the lockfile and matched.
- Backend: 246 passed, two opt-in real database suites skipped in this command. Separately, both real MongoDB suites ran: 12 test entries passed with Cloudinary mocked, exact fixture removal verified, local replica set stopped.
- Frontend: 162 tests passed; TypeScript and ESLint passed. Backend syntax checks passed for 112 files. Production build passed with the pre-existing large-bundle warning.
- Added security regressions for mapped-subnet IP spoofing, both qs issues, Axios inherited method selection and Vue SSR carriage-return attribute names.
- Full and production-only audits were refreshed after installation. Real Cloudinary uploads were not rerun: Cloudinary 2.11.0, Sharp 0.35.5, Multer 2.4.0, file-type 22.1.1 and the provider/processing code are unchanged; affected HTTP/frontend behavior was exercised in existing privacy/image regressions.
- npm warns about an existing Node engine mismatch: root → @vue/test-utils 2.5.1 → js-beautify 2.0.3 → nopt 10.0.1 → abbrev 5.0.0. The latter packages require Node `^22.22.2 || ^24.15.0 || >=26`; this environment is 22.20.0. These versions were already installed before this batch. Tests passed, but the engine warning remains; no runtime upgrade or compatibility override was performed.
- The existing backend installation lists optional `@img/sharp-wasm32`/`@emnapi/runtime` packages as extraneous. No unrelated package removal was attempted after the clean-reinstall refusal; native Sharp image regressions passed.
- No browser visual verification or Atlas/live-provider checks were performed in this batch. Existing application data/images/environment files were preserved; no commit or push.
