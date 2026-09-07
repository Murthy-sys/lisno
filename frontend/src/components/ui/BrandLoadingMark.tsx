/** Decorative mark; the containing loading state owns its announcement. */
export function BrandLoadingMark() {
  return <span className="lisno-loading-mark" aria-hidden="true">
    <img className="lisno-loading-mark__logo" src="/lisno-logo.svg" width="132" height="36" alt="" />
    <span className="lisno-loading-mark__track"><span /></span>
  </span>;
}
