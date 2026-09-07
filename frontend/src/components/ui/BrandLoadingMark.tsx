import loaderLogo from "../../assets/lisno-loader.svg";

/** Decorative mark; the containing loading state owns its announcement. */
export function BrandLoadingMark() {
  return <span className="lisno-loading-mark" aria-hidden="true">
    <img className="lisno-loading-mark__logo" src={loaderLogo} width="72" height="72" alt="" />
  </span>;
}
