import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { Checkbox, Field, FileInput, Input, Select, Textarea } from "./Field";

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
