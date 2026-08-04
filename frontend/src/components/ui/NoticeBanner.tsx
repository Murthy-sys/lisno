import { InlineMessage, type InlineMessageProps } from "./InlineMessage";

export type NoticeBannerProps = InlineMessageProps;

export function NoticeBanner({ label, ...messageProps }: NoticeBannerProps) {
  return (
    <section
      className="ui-notice-banner"
      role={label ? "region" : undefined}
      aria-label={label}
    >
      <InlineMessage {...messageProps} />
    </section>
  );
}
