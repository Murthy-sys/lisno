import { Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useFeedback } from "../../components/feedback/FeedbackProvider";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { EmptyState } from "../../components/ui/EmptyState";
import { Field, Input } from "../../components/ui/Field";
import { IconButton } from "../../components/ui/IconButton";
import { InlineMessage } from "../../components/ui/InlineMessage";
import { NoticeBanner } from "../../components/ui/NoticeBanner";
import { PageHeader } from "../../components/ui/PageHeader";
import { PageState } from "../../components/ui/PageState";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { SectionState } from "../../components/ui/SectionState";
import { Skeleton } from "../../components/ui/Skeleton";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Surface } from "../../components/ui/Surface";

export type FoundationQaState =
  | "default"
  | "loading"
  | "empty"
  | "error"
  | "conflict"
  | "session-expired"
  | "toast"
  | "drawer";

function SuccessToastFixture() {
  const feedback = useFeedback();
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    feedback.success({
      title: "Foundation saved",
      message: "The deterministic preview is ready.",
      durationMs: 60 * 60 * 1_000
    });
  }, [feedback]);

  return null;
}

function DefaultGallery() {
  return (
    <>
      <SectionHeader
        id="foundation-primitives-title"
        title="Shared primitives"
        description="Representative controls and feedback states."
      />
      <Surface as="section" aria-label="Foundation surface" variant="raised">
        <Button>Primary action</Button>
        <Button variant="secondary">Secondary action</Button>
        <Button variant="quiet">Quiet action</Button>
        <Button variant="destructive">Delete item</Button>
        <Button disabled>Unavailable action</Button>
        <Button busy busyLabel="Saving…">Save changes</Button>
        <IconButton
          label="Open settings"
          tooltip="Open foundation settings"
          icon={<Settings aria-hidden="true" />}
        />
      </Surface>

      <Surface as="section" aria-label="Foundation fields" variant="subtle">
        <Field id="foundation-project" label="Project name" hint="Use the client-facing name.">
          {(controlProps) => <Input {...controlProps} defaultValue="Residence" />}
        </Field>
        <Field
          id="foundation-reference"
          label="Reference code"
          error="Use a six-character reference."
        >
          {(controlProps) => <Input {...controlProps} defaultValue="ABC" />}
        </Field>
      </Surface>

      <Surface as="section" aria-label="Foundation statuses">
        <StatusBadge label="Draft" tone="neutral" />
        <StatusBadge label="Ready" tone="success" />
        <StatusBadge label="At risk" tone="warning" />
        <StatusBadge label="Blocked" tone="danger" />
        <StatusBadge label="Information" tone="info" />
        <ProgressBar value={64} label="Foundation progress" />
        <ProgressBar label="Preparing preview" />
      </Surface>

      <InlineMessage tone="error" label="Validation guidance">
        Correct the marked reference before continuing.
      </InlineMessage>
      <NoticeBanner tone="warning" label="Foundation notice" title="Review required">
        Confirm the shared semantics before release.
      </NoticeBanner>
      <EmptyState
        title="No archived items"
        description="Archived foundation examples will appear here."
        action={<Button variant="secondary">Browse active items</Button>}
      />
      <div>
        <Skeleton />
        <Skeleton shape="block" />
      </div>
      <SuccessToastFixture />
    </>
  );
}

function StateContent({ state }: { state: FoundationQaState }) {
  switch (state) {
    case "loading":
      return (
        <PageState
          state="loading"
          message="Loading foundation content…"
          statusLabel="Foundation loading status"
        />
      );
    case "empty":
      return (
        <SectionState
          state="empty"
          title="Foundation records"
          message="No foundation records yet."
          action={{ label: "Create record", onAction: () => undefined }}
        />
      );
    case "error":
      return (
        <PageState
          state="error"
          message="Foundation content is unavailable."
          action={{ label: "Try again", onAction: () => undefined }}
        />
      );
    case "conflict":
      return (
        <NoticeBanner tone="warning" label="Editing conflict" title="Newer changes exist">
          Refresh to load the latest version.
        </NoticeBanner>
      );
    case "session-expired":
      return (
        <NoticeBanner tone="error" label="Session expired" title="Sign-in required">
          Your session expired. Sign in again.
        </NoticeBanner>
      );
    case "toast":
      return <SuccessToastFixture />;
    case "drawer":
      return <p>The drawer is open beside this page landmark.</p>;
    default:
      return <DefaultGallery />;
  }
}

export function FoundationQaPage({ state = "default" }: { state?: FoundationQaState }) {
  const [drawerOpen, setDrawerOpen] = useState(state === "drawer");

  return (
    <>
      <main id="main-content" tabIndex={-1}>
        <PageHeader
          id="foundation-page-title"
          eyebrow="Development QA"
          title="UI foundation gallery"
          description="Deterministic shared primitive accessibility states."
        />
        <StateContent state={state} />
      </main>
      <Drawer
        id="foundation-navigation"
        open={drawerOpen}
        title="Foundation navigation"
        onClose={() => setDrawerOpen(false)}
      >
        <Button variant="secondary" onClick={() => setDrawerOpen(false)}>
          Close drawer
        </Button>
      </Drawer>
    </>
  );
}
