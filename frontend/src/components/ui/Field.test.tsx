import { createRef, useState } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { Checkbox, Field, FileInput, Input, Radio, Select, Textarea } from "./Field";

const primitives = readFileSync(resolve(process.cwd(), "src/styles/primitives.css"), "utf8");

describe("Field", () => {
  it("associates a required control with its label, hint, and error", () => {
    render(
      <Field
        id="project-name"
        label="Project name"
        hint="Use the client-facing name."
        error="Project name is required."
        required
      >
        {(controlProps) => <Input {...controlProps} />}
      </Field>
    );

    const input = screen.getByRole("textbox", { name: "Project name" });
    const marker = screen.getByText("*");
    const error = screen.getByText("Project name is required.");

    expect(input).toBeRequired();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "project-name-hint project-name-error");
    expect(input).toHaveAccessibleDescription("Use the client-facing name. Project name is required.");
    expect(marker).toHaveAttribute("aria-hidden", "true");
    expect(error.parentElement?.querySelector("svg")).toBeInTheDocument();
  });

  it("omits invalid signaling when a field has no error", () => {
    render(
      <Field id="project-name" label="Project name">
        {(controlProps) => <Input {...controlProps} />}
      </Field>
    );

    expect(screen.getByRole("textbox", { name: "Project name" })).not.toHaveAttribute("aria-invalid");
  });

  it("uses only the hint ID when no error is supplied", () => {
    render(
      <Field id="project-name" label="Project name" hint="Use the client-facing name.">
        {(controlProps) => <Input {...controlProps} />}
      </Field>
    );

    expect(screen.getByRole("textbox", { name: "Project name" })).toHaveAttribute(
      "aria-describedby",
      "project-name-hint"
    );
  });

  it("uses only the error ID when no hint is supplied", () => {
    render(
      <Field id="project-name" label="Project name" error="Project name is required.">
        {(controlProps) => <Input {...controlProps} />}
      </Field>
    );

    expect(screen.getByRole("textbox", { name: "Project name" })).toHaveAttribute(
      "aria-describedby",
      "project-name-error"
    );
  });

  it("appends consumer descriptions after field-owned hint and error IDs", () => {
    render(
      <>
        <p id="existing-description">Visible to clients after launch.</p>
        <Field
          id="project-name"
          label="Project name"
          hint="Use the client-facing name."
          error="Project name is required."
          describedBy="existing-description"
        >
          {(controlProps) => <Input {...controlProps} />}
        </Field>
      </>
    );

    const input = screen.getByRole("textbox", { name: "Project name" });

    expect(input).toHaveAttribute(
      "aria-describedby",
      "project-name-hint project-name-error existing-description"
    );
    expect(input).toHaveAccessibleDescription(
      "Use the client-facing name. Project name is required. Visible to clients after launch."
    );
  });
});

interface ProjectFormValues {
  email: string;
  format: string;
  notes: string;
  approved: boolean;
  attachment: FileList;
}

function HookFormHarness() {
  const { register, handleSubmit } = useForm<ProjectFormValues>({
    defaultValues: {
      email: "",
      format: "pdf",
      notes: "",
      approved: false,
    },
  });
  const [submission, setSubmission] = useState("");

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => {
        setSubmission(
          [
            values.email,
            values.format,
            values.notes,
            String(values.approved),
            values.attachment?.item(0)?.name ?? "",
          ].join("|")
        );
      })}
    >
      <Field id="email" label="Email address" required>
        {(controlProps) => (
          <Input
            {...register("email", { required: true })}
            {...controlProps}
            autoComplete="email"
            inputMode="email"
          />
        )}
      </Field>
      <Field id="format" label="Delivery format">
        {(controlProps) => (
          <Select {...register("format")} {...controlProps}>
            <option value="pdf">PDF</option>
            <option value="docx">Word</option>
          </Select>
        )}
      </Field>
      <Field id="notes" label="Project notes">
        {(controlProps) => <Textarea {...register("notes")} {...controlProps} rows={4} />}
      </Field>
      <Field id="approved" label="Client approved">
        {(controlProps) => <Checkbox {...register("approved")} {...controlProps} />}
      </Field>
      <Field id="upload-plan" label="Upload plan">
        {(controlProps) => (
          <FileInput {...register("attachment")} {...controlProps} accept=".pdf,image/*" multiple />
        )}
      </Field>
      <button type="submit">Submit project</button>
      <output aria-label="Submission result">{submission}</output>
    </form>
  );
}

describe("native form controls", () => {
  it("keeps an invalid native checkbox associated with its label and a non-color-only outline", () => {
    render(
      <Field id="approved" label="Client approved" error="Client approval is required.">
        {(controlProps) => <Checkbox {...controlProps} />}
      </Field>
    );

    const checkbox = screen.getByRole("checkbox", { name: "Client approved" });

    expect(checkbox).toHaveAttribute("aria-invalid", "true");
    expect(checkbox).toHaveAccessibleDescription("Client approval is required.");
    expect((checkbox as HTMLInputElement).labels?.[0]).toBe(screen.getByText("Client approved"));
    expect(primitives).toMatch(
      /\.ui-checkbox\[aria-invalid="true"\]\s*\{[^}]*outline:\s*var\(--space-1\) dashed var\(--color-danger\)/s
    );
  });

  it("toggles separate and wrapping labels once while preserving checkbox refs, mixed state and native form values", async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    const renderChoices = (disabled = false) => <form aria-label="Room selection">
      <Field id="living" label="Living room" hint="Include the existing furniture.">
        {props => <Checkbox {...props} ref={ref} name="rooms" value="living" disabled={disabled} onChange={onChange} />}
      </Field>
      <label><Checkbox name="rooms" value="kitchen" />Kitchen</label>
    </form>;
    const { rerender } = render(renderChoices());
    const living = screen.getByRole("checkbox", { name: "Living room" });
    const kitchen = screen.getByRole("checkbox", { name: "Kitchen" });
    const form = screen.getByRole("form", { name: "Room selection" }) as HTMLFormElement;

    expect(ref.current).toBe(living);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    await user.click(screen.getByText("Living room"));
    expect(living).toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(living).toHaveFocus();

    ref.current!.indeterminate = true;
    expect(living).toBePartiallyChecked();
    await user.keyboard(" ");
    expect(living).not.toBePartiallyChecked();
    expect(living).not.toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(2);

    await user.click(screen.getByText("Kitchen"));
    expect(kitchen).toBeChecked();
    expect(new FormData(form).getAll("rooms")).toEqual(["kitchen"]);
    rerender(renderChoices(true));
    await user.click(screen.getByText("Living room"));
    expect(living).toBeDisabled();
    expect(living).not.toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(new FormData(form).getAll("rooms")).toEqual(["kitchen"]);
  });

  it("preserves native radio grouping, forwarded focus and keyboard selection", async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLInputElement>();
    render(<form aria-label="Measurement method">
      <label><Radio ref={ref} name="method" value="dimensions" defaultChecked />Dimensions</label>
      <label><Radio name="method" value="count" />Count</label>
    </form>);
    const dimensions = screen.getByRole("radio", { name: "Dimensions" });
    const count = screen.getByRole("radio", { name: "Count" });
    expect(ref.current).toBe(dimensions);
    ref.current!.focus();
    expect(dimensions).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(count).toHaveFocus();
    expect(count).toBeChecked();
    expect(dimensions).not.toBeChecked();
    const form = screen.getByRole("form", { name: "Measurement method" }) as HTMLFormElement;
    expect(new FormData(form).get("method")).toBe("count");
  });

  it("keeps React Hook Form registration, native attributes, submitted values, and invalid focus intact", async () => {
    const user = userEvent.setup();
    render(<HookFormHarness />);

    const email = screen.getByRole("textbox", { name: "Email address" });
    const format = screen.getByRole("combobox", { name: "Delivery format" });
    const notes = screen.getByRole("textbox", { name: "Project notes" });
    const approved = screen.getByRole("checkbox", { name: "Client approved" });
    const attachment = screen.getByLabelText("Upload plan");

    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toHaveAttribute("inputmode", "email");
    expect(format).toHaveValue("pdf");
    expect(notes).toHaveAttribute("rows", "4");
    expect(approved).not.toBeChecked();
    expect(attachment).toHaveAttribute("accept", ".pdf,image/*");
    expect(attachment).toHaveAttribute("multiple");

    await user.click(screen.getByRole("button", { name: "Submit project" }));
    await waitFor(() => expect(email).toHaveFocus());

    await user.type(email, "ada@example.com");
    await user.selectOptions(format, "docx");
    await user.type(notes, "Send the final plan.");
    await user.click(approved);
    await user.upload(attachment, new File(["project"], "project-plan.pdf", { type: "application/pdf" }));

    expect(email).toHaveValue("ada@example.com");
    expect(format).toHaveValue("docx");
    expect(notes).toHaveValue("Send the final plan.");
    expect(approved).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Submit project" }));

    expect(screen.getByLabelText("Submission result")).toHaveTextContent(
      "ada@example.com|docx|Send the final plan.|true|project-plan.pdf"
    );
  });
});
