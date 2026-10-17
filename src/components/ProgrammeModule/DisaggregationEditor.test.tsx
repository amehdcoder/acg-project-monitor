import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import DisaggregationEditor from "./DisaggregationEditor";
import { dimensionFor, parseDisaggCell, serializeDisaggCell, summarizeDisaggCell } from "@/lib/programmeModule/disaggregationCatalog";

const Harness = ({ labels }: { labels: string[] }) => {
  const [values, setValues] = useState<Record<string, string>>({});
  return <DisaggregationEditor labels={labels} values={values} onChange={setValues} idPrefix="t" />;
};

describe("disaggregation catalog", () => {
  it("maps logframe labels to standard dimensions", () => {
    expect(dimensionFor("Gender").key).toBe("sex");
    expect(dimensionFor("Sex").label).toBe("Sex");
    expect(dimensionFor("Age band").groups!.flatMap(g => g.options)).toContain("5–14 years");
    expect(dimensionFor("Disease condition").groups![0].options).toContain("Hydrocoele");
    expect(dimensionFor("Impairment / Disability type").groups![0].options).toContain("Albinism");
    expect(dimensionFor("Stakeholder type").groups![0].options).toContain("Community Directed Distributors (CDDs)");
    expect(dimensionFor("State").kind).toBe("location");
    expect(dimensionFor("LGA").kind).toBe("location");
    expect(dimensionFor("Ward").kind).toBe("location");
  });

  it("serializes and parses option maps, dropping zeros", () => {
    const raw = serializeDisaggCell({ Male: 12, Female: 9, "0–4 years": 0 });
    expect(parseDisaggCell(raw)).toEqual({ Male: 12, Female: 9 });
    expect(summarizeDisaggCell(raw)).toBe("Male: 12 · Female: 9");
    expect(parseDisaggCell("legacy free text")).toEqual({});
  });
});

describe("DisaggregationEditor", () => {
  it("opens a dimension panel on chip tap and stores per-option values", () => {
    render(<Harness labels={["Sex", "Age band"]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Sex/ }));
    const male = screen.getByLabelText("Sex — Male");
    fireEvent.change(male, { target: { value: "7" } });
    expect(screen.getByRole("button", { name: /Male: 7/ })).toBeTruthy();
  });
});
