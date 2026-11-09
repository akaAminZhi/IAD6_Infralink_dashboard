import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { formatDateTime } from "../../utils/formatters";
import { EquipmentUpdateInfo } from "./EquipmentUpdateInfo";

describe("EquipmentUpdateInfo", () => {
  it("displays the Excel editor and formatted update time", () => {
    render(<EquipmentUpdateInfo updated_by=" Equipment Editor " updated_at="2026-11-06T10:30:00" />);
    expect(screen.getByText("Equipment Editor")).toBeInTheDocument();
    expect(screen.getByText(formatDateTime("2026-11-06T10:30:00"))).toBeInTheDocument();
  });

  it.each([undefined, null, "", "   "])("shows placeholders for missing export values (%s)", (value) => {
    render(<EquipmentUpdateInfo updated_by={value} updated_at={value} />);
    expect(screen.getAllByText("--")).toHaveLength(2);
  });
});
