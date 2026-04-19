/**
 * AdvancedQuestionSettings
 * ------------------------
 * Per-question-type advanced configuration panels for the Form Builder.
 *
 * Renders the right set of fields for the question's type, persisting them
 * back into the canonical Question shape (text, number, choice, dateSettings,
 * geo, media, signature, range, matrix, rank, calc, note, acknowledge).
 *
 * All fields are OPTIONAL. The Form Filler falls back to current behavior
 * when a setting is unset — so this is fully backwards-compatible with every
 * form already in the database.
 *
 * This component is fully self-contained — no external services required.
 */

import { Question } from "./types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Sparkles } from "lucide-react";

interface Props {
  question: Question;
  onUpdate: (q: Question) => void;
}

/** Helper: update a nested settings bucket without losing other keys. */
function patchBucket<K extends keyof Question>(
  q: Question,
  key: K,
  patch: Partial<NonNullable<Question[K]>>,
): Question {
  const current = (q[key] as object) || {};
  return { ...q, [key]: { ...current, ...patch } } as Question;
}

const AdvancedQuestionSettings = ({ question, onUpdate }: Props) => {
  const t = question.type;

  // Choose the relevant section IDs based on question type.
  const sections: string[] = [];
  if (t === "text") sections.push("text");
  if (t === "number") sections.push("number");
  if (t === "select_one" || t === "select_multiple" || t === "rank") sections.push("choice");
  if (t === "rank") sections.push("rank");
  if (t === "date" || t === "datetime" || t === "time") sections.push("date");
  if (t === "geopoint" || t === "geotrace" || t === "geoshape") sections.push("geo");
  if (t === "image" || t === "audio" || t === "video" || t === "file") sections.push("media");
  if (t === "signature") sections.push("signature");
  if (t === "range") sections.push("range");
  if (t === "matrix") sections.push("matrix");
  if (t === "calculate") sections.push("calc");
  if (t === "note") sections.push("note");
  if (t === "acknowledge") sections.push("acknowledge");
  // Universal length validation works for several text-like types
  if (["text", "number", "select_multiple"].includes(t)) sections.push("validation");

  if (sections.length === 0) return null;

  return (
    <div className="rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        Advanced settings
      </div>

      <Accordion type="multiple" className="w-full">
        {/* ===================== TEXT ===================== */}
        {sections.includes("text") && (
          <AccordionItem value="text">
            <AccordionTrigger className="text-sm">Text input</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <Label>Multiline (textarea)</Label>
                <Switch
                  checked={!!question.text?.multiline}
                  onCheckedChange={(v) => onUpdate(patchBucket(question, "text", { multiline: v }))}
                />
              </div>

              {question.text?.multiline && (
                <div className="space-y-2">
                  <Label>Rows</Label>
                  <Input
                    type="number"
                    min={2}
                    max={20}
                    value={question.text?.rows ?? 4}
                    onChange={(e) =>
                      onUpdate(patchBucket(question, "text", { rows: Number(e.target.value) }))
                    }
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Input mask preset</Label>
                <Select
                  value={question.text?.mask ?? "none"}
                  onValueChange={(v) =>
                    onUpdate(patchBucket(question, "text", { mask: v as never }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="phone">Phone number</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="url">URL</SelectItem>
                    <SelectItem value="nin">Nigeria NIN (11 digits)</SelectItem>
                    <SelectItem value="bvn">BVN (11 digits)</SelectItem>
                    <SelectItem value="credit_card">Credit card</SelectItem>
                    <SelectItem value="custom">Custom regex…</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {question.text?.mask === "custom" && (
                <div className="space-y-2">
                  <Label>Custom regex pattern</Label>
                  <Input
                    value={question.text?.pattern ?? ""}
                    onChange={(e) =>
                      onUpdate(patchBucket(question, "text", { pattern: e.target.value }))
                    }
                    placeholder="^[A-Z]{2}[0-9]{6}$"
                    className="font-mono text-sm"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Placeholder</Label>
                <Input
                  value={question.text?.placeholder ?? ""}
                  onChange={(e) =>
                    onUpdate(patchBucket(question, "text", { placeholder: e.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Auto-capitalize</Label>
                  <Select
                    value={question.text?.autoCapitalize ?? "sentences"}
                    onValueChange={(v) =>
                      onUpdate(patchBucket(question, "text", { autoCapitalize: v as never }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off">Off</SelectItem>
                      <SelectItem value="sentences">Sentences</SelectItem>
                      <SelectItem value="words">Words</SelectItem>
                      <SelectItem value="characters">Characters</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col justify-end gap-2">
                  <div className="flex items-center justify-between">
                    <Label>Spellcheck</Label>
                    <Switch
                      checked={question.text?.spellcheck ?? true}
                      onCheckedChange={(v) =>
                        onUpdate(patchBucket(question, "text", { spellcheck: v }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>RTL (Arabic/Hebrew)</Label>
                    <Switch
                      checked={!!question.text?.rtl}
                      onCheckedChange={(v) => onUpdate(patchBucket(question, "text", { rtl: v }))}
                    />
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ===================== NUMBER ===================== */}
        {sections.includes("number") && (
          <AccordionItem value="number">
            <AccordionTrigger className="text-sm">Number formatting</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={question.number?.kind ?? "decimal"}
                    onValueChange={(v) =>
                      onUpdate(patchBucket(question, "number", { kind: v as never }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="integer">Integer (no decimals)</SelectItem>
                      <SelectItem value="decimal">Decimal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {question.number?.kind !== "integer" && (
                  <div className="space-y-2">
                    <Label>Decimal places</Label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={question.number?.decimalPlaces ?? 2}
                      onChange={(e) =>
                        onUpdate(
                          patchBucket(question, "number", { decimalPlaces: Number(e.target.value) }),
                        )
                      }
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Unit suffix</Label>
                  <Input
                    value={question.number?.unit ?? ""}
                    onChange={(e) =>
                      onUpdate(patchBucket(question, "number", { unit: e.target.value }))
                    }
                    placeholder="kg, °C, ₦, %"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Step (± buttons)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={question.number?.step ?? ""}
                    onChange={(e) =>
                      onUpdate(
                        patchBucket(question, "number", {
                          step: e.target.value ? Number(e.target.value) : undefined,
                        }),
                      )
                    }
                    placeholder="1"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label>Show thousands separator (1,234)</Label>
                <Switch
                  checked={!!question.number?.thousandsSeparator}
                  onCheckedChange={(v) =>
                    onUpdate(patchBucket(question, "number", { thousandsSeparator: v }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Show ± stepper buttons</Label>
                <Switch
                  checked={!!question.number?.showStepper}
                  onCheckedChange={(v) =>
                    onUpdate(patchBucket(question, "number", { showStepper: v }))
                  }
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ===================== CHOICE / RANK ===================== */}
        {sections.includes("choice") && (
          <AccordionItem value="choice">
            <AccordionTrigger className="text-sm">Choice options</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="space-y-2">
                <Label>Display layout</Label>
                <Select
                  value={question.choice?.layout ?? "list"}
                  onValueChange={(v) =>
                    onUpdate(patchBucket(question, "choice", { layout: v as never }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="list">List (default)</SelectItem>
                    <SelectItem value="grid">Grid (2-column)</SelectItem>
                    <SelectItem value="chips">Chips / pills</SelectItem>
                    <SelectItem value="dropdown">Dropdown</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between">
                  <Label>Searchable</Label>
                  <Switch
                    checked={!!question.choice?.searchable}
                    onCheckedChange={(v) =>
                      onUpdate(patchBucket(question, "choice", { searchable: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Randomize order</Label>
                  <Switch
                    checked={!!question.choice?.randomize}
                    onCheckedChange={(v) =>
                      onUpdate(patchBucket(question, "choice", { randomize: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Allow "Other"</Label>
                  <Switch
                    checked={!!question.choice?.allowOther}
                    onCheckedChange={(v) =>
                      onUpdate(patchBucket(question, "choice", { allowOther: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Allow add new</Label>
                  <Switch
                    checked={!!question.choice?.allowAddNew}
                    onCheckedChange={(v) =>
                      onUpdate(patchBucket(question, "choice", { allowAddNew: v }))
                    }
                  />
                </div>
              </div>

              {question.choice?.allowOther && (
                <div className="space-y-2">
                  <Label>"Other" label</Label>
                  <Input
                    value={question.choice?.otherLabel ?? "Other (please specify)"}
                    onChange={(e) =>
                      onUpdate(patchBucket(question, "choice", { otherLabel: e.target.value }))
                    }
                  />
                </div>
              )}

              {(t === "select_multiple" || t === "rank") && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Min selections</Label>
                    <Input
                      type="number"
                      min={0}
                      value={question.choice?.minSelections ?? ""}
                      onChange={(e) =>
                        onUpdate(
                          patchBucket(question, "choice", {
                            minSelections: e.target.value ? Number(e.target.value) : undefined,
                          }),
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max selections</Label>
                    <Input
                      type="number"
                      min={0}
                      value={question.choice?.maxSelections ?? ""}
                      onChange={(e) =>
                        onUpdate(
                          patchBucket(question, "choice", {
                            maxSelections: e.target.value ? Number(e.target.value) : undefined,
                          }),
                        )
                      }
                    />
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ===================== RANK ===================== */}
        {sections.includes("rank") && (
          <AccordionItem value="rank">
            <AccordionTrigger className="text-sm">Rank UI</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="space-y-2">
                <Label>Style</Label>
                <Select
                  value={question.rank?.style ?? "drag"}
                  onValueChange={(v) =>
                    onUpdate(patchBucket(question, "rank", { style: v as never }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="drag">Drag handles (default)</SelectItem>
                    <SelectItem value="numbered">Numbered (1, 2, 3…)</SelectItem>
                    <SelectItem value="stars">Stars (1–5)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Max items to rank</Label>
                <Input
                  type="number"
                  min={1}
                  value={question.rank?.maxItems ?? ""}
                  onChange={(e) =>
                    onUpdate(
                      patchBucket(question, "rank", {
                        maxItems: e.target.value ? Number(e.target.value) : undefined,
                      }),
                    )
                  }
                  placeholder="Leave blank to rank all"
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ===================== DATE / TIME ===================== */}
        {sections.includes("date") && (
          <AccordionItem value="date">
            <AccordionTrigger className="text-sm">Date / Time settings</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="space-y-2">
                <Label>Default value</Label>
                <Select
                  value={question.dateSettings?.defaultTo ?? "none"}
                  onValueChange={(v) =>
                    onUpdate(
                      patchBucket(question, "dateSettings", {
                        defaultTo: v === "none" ? undefined : (v as never),
                      }),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No default</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="now">Now (date + time)</SelectItem>
                    <SelectItem value="yesterday">Yesterday</SelectItem>
                    <SelectItem value="tomorrow">Tomorrow</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Min date</Label>
                  <Input
                    type="text"
                    value={question.dateSettings?.minDate ?? ""}
                    onChange={(e) =>
                      onUpdate(
                        patchBucket(question, "dateSettings", { minDate: e.target.value }),
                      )
                    }
                    placeholder="2000-01-01 or today"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max date</Label>
                  <Input
                    type="text"
                    value={question.dateSettings?.maxDate ?? ""}
                    onChange={(e) =>
                      onUpdate(
                        patchBucket(question, "dateSettings", { maxDate: e.target.value }),
                      )
                    }
                    placeholder="today or 2030-12-31"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Calendar</Label>
                  <Select
                    value={question.dateSettings?.calendar ?? "gregorian"}
                    onValueChange={(v) =>
                      onUpdate(patchBucket(question, "dateSettings", { calendar: v as never }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gregorian">Gregorian (default)</SelectItem>
                      <SelectItem value="hijri">Hijri (Islamic)</SelectItem>
                      <SelectItem value="ethiopian">Ethiopian</SelectItem>
                      <SelectItem value="buddhist">Buddhist</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input
                    value={question.dateSettings?.timezone ?? ""}
                    onChange={(e) =>
                      onUpdate(
                        patchBucket(question, "dateSettings", { timezone: e.target.value }),
                      )
                    }
                    placeholder="Africa/Lagos"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between">
                  <Label>Weekdays only</Label>
                  <Switch
                    checked={!!question.dateSettings?.weekdaysOnly}
                    onCheckedChange={(v) =>
                      onUpdate(patchBucket(question, "dateSettings", { weekdaysOnly: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Show age (DOB)</Label>
                  <Switch
                    checked={!!question.dateSettings?.showAgeFromDOB}
                    onCheckedChange={(v) =>
                      onUpdate(patchBucket(question, "dateSettings", { showAgeFromDOB: v }))
                    }
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ===================== GEO ===================== */}
        {sections.includes("geo") && (
          <AccordionItem value="geo">
            <AccordionTrigger className="text-sm">GPS / Location settings</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Min accuracy (m)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={question.geo?.minAccuracyMeters ?? ""}
                    onChange={(e) =>
                      onUpdate(
                        patchBucket(question, "geo", {
                          minAccuracyMeters: e.target.value ? Number(e.target.value) : undefined,
                        }),
                      )
                    }
                    placeholder="e.g. 20"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max retries</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={question.geo?.maxRetries ?? ""}
                    onChange={(e) =>
                      onUpdate(
                        patchBucket(question, "geo", {
                          maxRetries: e.target.value ? Number(e.target.value) : undefined,
                        }),
                      )
                    }
                    placeholder="3"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between">
                  <Label>Auto-retry</Label>
                  <Switch
                    checked={!!question.geo?.autoRetry}
                    onCheckedChange={(v) => onUpdate(patchBucket(question, "geo", { autoRetry: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Capture altitude</Label>
                  <Switch
                    checked={!!question.geo?.captureAltitude}
                    onCheckedChange={(v) =>
                      onUpdate(patchBucket(question, "geo", { captureAltitude: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Capture heading</Label>
                  <Switch
                    checked={!!question.geo?.captureHeading}
                    onCheckedChange={(v) =>
                      onUpdate(patchBucket(question, "geo", { captureHeading: v }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Cache offline tiles</Label>
                  <Switch
                    checked={!!question.geo?.offlineTiles}
                    onCheckedChange={(v) =>
                      onUpdate(patchBucket(question, "geo", { offlineTiles: v }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Map style</Label>
                <Select
                  value={question.geo?.mapStyle ?? "streets"}
                  onValueChange={(v) =>
                    onUpdate(patchBucket(question, "geo", { mapStyle: v as never }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="streets">Streets</SelectItem>
                    <SelectItem value="satellite">Satellite</SelectItem>
                    <SelectItem value="terrain">Terrain</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ===================== MEDIA ===================== */}
        {sections.includes("media") && (
          <AccordionItem value="media">
            <AccordionTrigger className="text-sm">Media capture</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Max items</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={question.media?.maxCount ?? ""}
                    onChange={(e) =>
                      onUpdate(
                        patchBucket(question, "media", {
                          maxCount: e.target.value ? Number(e.target.value) : undefined,
                        }),
                      )
                    }
                    placeholder="1"
                  />
                </div>
                {(t === "audio" || t === "video") && (
                  <div className="space-y-2">
                    <Label>Max duration (sec)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={question.media?.maxDurationSec ?? ""}
                      onChange={(e) =>
                        onUpdate(
                          patchBucket(question, "media", {
                            maxDurationSec: e.target.value ? Number(e.target.value) : undefined,
                          }),
                        )
                      }
                      placeholder="60"
                    />
                  </div>
                )}
              </div>

              {t === "image" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Max resolution (px)</Label>
                    <Input
                      type="number"
                      min={320}
                      max={4096}
                      value={question.media?.maxResolutionPx ?? ""}
                      onChange={(e) =>
                        onUpdate(
                          patchBucket(question, "media", {
                            maxResolutionPx: e.target.value ? Number(e.target.value) : undefined,
                          }),
                        )
                      }
                      placeholder="1600"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Quality (0–1)</Label>
                    <Input
                      type="number"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={question.media?.quality ?? ""}
                      onChange={(e) =>
                        onUpdate(
                          patchBucket(question, "media", {
                            quality: e.target.value ? Number(e.target.value) : undefined,
                          }),
                        )
                      }
                      placeholder="0.8"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {t === "image" && (
                  <>
                    <div className="flex items-center justify-between">
                      <Label>Watermark (GPS+time)</Label>
                      <Switch
                        checked={!!question.media?.watermark}
                        onCheckedChange={(v) =>
                          onUpdate(patchBucket(question, "media", { watermark: v }))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Strip EXIF</Label>
                      <Switch
                        checked={!!question.media?.stripExif}
                        onCheckedChange={(v) =>
                          onUpdate(patchBucket(question, "media", { stripExif: v }))
                        }
                      />
                    </div>
                  </>
                )}
                {(t === "image" || t === "video") && (
                  <>
                    <div className="flex items-center justify-between">
                      <Label>Camera only (no gallery)</Label>
                      <Switch
                        checked={!!question.media?.cameraOnly}
                        onCheckedChange={(v) =>
                          onUpdate(patchBucket(question, "media", { cameraOnly: v }))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Front camera (selfie)</Label>
                      <Switch
                        checked={!!question.media?.frontCamera}
                        onCheckedChange={(v) =>
                          onUpdate(patchBucket(question, "media", { frontCamera: v }))
                        }
                      />
                    </div>
                  </>
                )}
              </div>

              {t === "file" && (
                <div className="space-y-2">
                  <Label>Allowed file types (MIME)</Label>
                  <Input
                    value={question.media?.accept ?? ""}
                    onChange={(e) =>
                      onUpdate(patchBucket(question, "media", { accept: e.target.value }))
                    }
                    placeholder="application/pdf,image/*,.docx"
                  />
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ===================== SIGNATURE ===================== */}
        {sections.includes("signature") && (
          <AccordionItem value="signature">
            <AccordionTrigger className="text-sm">Signature pen</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Pen color</Label>
                  <Input
                    type="color"
                    value={question.signature?.penColor ?? "#1a1a2e"}
                    onChange={(e) =>
                      onUpdate(patchBucket(question, "signature", { penColor: e.target.value }))
                    }
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pen width (px)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={question.signature?.penWidth ?? 2}
                    onChange={(e) =>
                      onUpdate(
                        patchBucket(question, "signature", { penWidth: Number(e.target.value) }),
                      )
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Background color</Label>
                <Input
                  type="color"
                  value={question.signature?.backgroundColor ?? "#ffffff"}
                  onChange={(e) =>
                    onUpdate(
                      patchBucket(question, "signature", { backgroundColor: e.target.value }),
                    )
                  }
                  className="h-10"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Require printed name</Label>
                <Switch
                  checked={!!question.signature?.requirePrintedName}
                  onCheckedChange={(v) =>
                    onUpdate(patchBucket(question, "signature", { requirePrintedName: v }))
                  }
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ===================== RANGE ===================== */}
        {sections.includes("range") && (
          <AccordionItem value="range">
            <AccordionTrigger className="text-sm">Slider settings</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Step</Label>
                  <Input
                    type="number"
                    step="any"
                    value={question.range?.step ?? 1}
                    onChange={(e) =>
                      onUpdate(patchBucket(question, "range", { step: Number(e.target.value) }))
                    }
                  />
                </div>
                <div className="flex flex-col justify-end gap-2">
                  <div className="flex items-center justify-between">
                    <Label>Show ticks</Label>
                    <Switch
                      checked={!!question.range?.showTicks}
                      onCheckedChange={(v) =>
                        onUpdate(patchBucket(question, "range", { showTicks: v }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Value bubble</Label>
                    <Switch
                      checked={question.range?.showValueBubble ?? true}
                      onCheckedChange={(v) =>
                        onUpdate(patchBucket(question, "range", { showValueBubble: v }))
                      }
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input
                  value={question.range?.minLabel ?? ""}
                  onChange={(e) =>
                    onUpdate(patchBucket(question, "range", { minLabel: e.target.value }))
                  }
                  placeholder="Min label"
                />
                <Input
                  value={question.range?.midLabel ?? ""}
                  onChange={(e) =>
                    onUpdate(patchBucket(question, "range", { midLabel: e.target.value }))
                  }
                  placeholder="Mid label"
                />
                <Input
                  value={question.range?.maxLabel ?? ""}
                  onChange={(e) =>
                    onUpdate(patchBucket(question, "range", { maxLabel: e.target.value }))
                  }
                  placeholder="Max label"
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ===================== MATRIX ===================== */}
        {sections.includes("matrix") && (
          <AccordionItem value="matrix">
            <AccordionTrigger className="text-sm">Matrix configuration</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Cell input</Label>
                  <Select
                    value={question.matrix?.cellInput ?? "single"}
                    onValueChange={(v) =>
                      onUpdate(patchBucket(question, "matrix", { cellInput: v as never }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single (radio per row)</SelectItem>
                      <SelectItem value="multiple">Multiple (checkbox per cell)</SelectItem>
                      <SelectItem value="scale">Scale (1-N)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Likert preset</Label>
                  <Select
                    value={question.matrix?.scale ?? "likert5"}
                    onValueChange={(v) =>
                      onUpdate(patchBucket(question, "matrix", { scale: v as never }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="likert5">Likert 5</SelectItem>
                      <SelectItem value="likert7">Likert 7</SelectItem>
                      <SelectItem value="satisfaction">Satisfaction</SelectItem>
                      <SelectItem value="agreement">Agreement</SelectItem>
                      <SelectItem value="frequency">Frequency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Rows (one per line — "id|label")</Label>
                <Textarea
                  rows={4}
                  value={(question.matrix?.rows ?? []).map((r) => `${r.id}|${r.label}`).join("\n")}
                  onChange={(e) => {
                    const rows = e.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((line) => {
                        const [id, ...rest] = line.split("|");
                        return { id: id.trim(), label: (rest.join("|") || id).trim() };
                      });
                    onUpdate(patchBucket(question, "matrix", { rows }));
                  }}
                  placeholder="q1|How satisfied are you with X?"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <Label>Columns (one per line — "value|label")</Label>
                <Textarea
                  rows={4}
                  value={(question.matrix?.columns ?? [])
                    .map((c) => `${c.value}|${c.label}`)
                    .join("\n")}
                  onChange={(e) => {
                    const columns = e.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((line) => {
                        const [value, ...rest] = line.split("|");
                        return {
                          id: value.trim(),
                          value: value.trim(),
                          label: (rest.join("|") || value).trim(),
                        };
                      });
                    onUpdate(patchBucket(question, "matrix", { columns }));
                  }}
                  placeholder={"1|Strongly disagree\n2|Disagree\n3|Neutral\n4|Agree\n5|Strongly agree"}
                  className="font-mono text-xs"
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ===================== CALCULATE ===================== */}
        {sections.includes("calc") && (
          <AccordionItem value="calc">
            <AccordionTrigger className="text-sm">Calculation display</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Decimal places</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={question.calc?.decimalPlaces ?? ""}
                    onChange={(e) =>
                      onUpdate(
                        patchBucket(question, "calc", {
                          decimalPlaces: e.target.value ? Number(e.target.value) : undefined,
                        }),
                      )
                    }
                    placeholder="2"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Show to respondent</Label>
                  <Switch
                    checked={!!question.calc?.visible}
                    onCheckedChange={(v) => onUpdate(patchBucket(question, "calc", { visible: v }))}
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ===================== NOTE ===================== */}
        {sections.includes("note") && (
          <AccordionItem value="note">
            <AccordionTrigger className="text-sm">Note style</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="space-y-2">
                <Label>Style</Label>
                <Select
                  value={question.note?.style ?? "plain"}
                  onValueChange={(v) =>
                    onUpdate(patchBucket(question, "note", { style: v as never }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plain">Plain</SelectItem>
                    <SelectItem value="info">Info (blue)</SelectItem>
                    <SelectItem value="success">Success (green)</SelectItem>
                    <SelectItem value="warning">Warning (amber)</SelectItem>
                    <SelectItem value="danger">Danger (red)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Render as Markdown</Label>
                <Switch
                  checked={!!question.note?.markdown}
                  onCheckedChange={(v) =>
                    onUpdate(patchBucket(question, "note", { markdown: v }))
                  }
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ===================== ACKNOWLEDGE ===================== */}
        {sections.includes("acknowledge") && (
          <AccordionItem value="acknowledge">
            <AccordionTrigger className="text-sm">Acknowledgement</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              <div className="space-y-2">
                <Label>Statement</Label>
                <Textarea
                  rows={3}
                  value={question.acknowledge?.statement ?? ""}
                  onChange={(e) =>
                    onUpdate(
                      patchBucket(question, "acknowledge", { statement: e.target.value }),
                    )
                  }
                  placeholder="I confirm that the information provided is accurate to the best of my knowledge."
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Require scroll-to-bottom first</Label>
                <Switch
                  checked={!!question.acknowledge?.requireScroll}
                  onCheckedChange={(v) =>
                    onUpdate(patchBucket(question, "acknowledge", { requireScroll: v }))
                  }
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* ===================== VALIDATION (length / count) ===================== */}
        {sections.includes("validation") && (
          <AccordionItem value="validation">
            <AccordionTrigger className="text-sm">Length & count limits</AccordionTrigger>
            <AccordionContent className="space-y-3 pt-2">
              {t === "text" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Min length</Label>
                    <Input
                      type="number"
                      min={0}
                      value={question.validation?.minLength ?? ""}
                      onChange={(e) =>
                        onUpdate({
                          ...question,
                          validation: {
                            ...question.validation,
                            minLength: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max length</Label>
                    <Input
                      type="number"
                      min={0}
                      value={question.validation?.maxLength ?? ""}
                      onChange={(e) =>
                        onUpdate({
                          ...question,
                          validation: {
                            ...question.validation,
                            maxLength: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Custom error message</Label>
                <Input
                  value={question.validation?.message ?? ""}
                  onChange={(e) =>
                    onUpdate({
                      ...question,
                      validation: { ...question.validation, message: e.target.value },
                    })
                  }
                  placeholder="Please enter a valid value"
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>
    </div>
  );
};

export default AdvancedQuestionSettings;
