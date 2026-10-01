import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EnergisationMarker } from "./EnergisationMarker";

describe("EnergisationMarker", () => {
  it("accepts a color override", () => {
    render(<svg><EnergisationMarker stage="offsite" x={10} y={20} color="#123456" /></svg>);
    const marker = screen.getByRole("img", { name: "Energised Offsite" });
    expect(marker.querySelector("svg")).toHaveAttribute("fill", "#123456");
    expect(marker.querySelector("svg")).toHaveClass("animate-energisation-breathe");
  });
});
