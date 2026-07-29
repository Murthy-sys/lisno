export function BrandLogo({ light = false }: { light?: boolean }) {
  return (
    <img
      className={`brand__logo${light ? " brand__logo--light" : ""}`}
      src="/lisno-logo.svg"
      width="110"
      height="30"
      alt="Lisno"
    />
  );
}
