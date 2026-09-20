// Health-facility location inheritance.
//
// Every record kept under a facility sits, by default, in the same State, LGA
// and Ward as the facility itself — that is how a facility register works on
// paper. So when a facility is chosen, the empty geography levels are filled in
// from it. Nothing already typed is overwritten, and every level stays editable:
// a person registered at a facility may well live in the next ward.

export interface GeoLevels {
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  community?: string | null;
}

export interface FacilityLike {
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
}

const blank = (v?: string | null) => !String(v ?? "").trim();

/**
 * Levels to fill from the facility. Only blank levels are returned, so the
 * caller can spread the patch without losing a choice the user already made.
 */
export const facilityGeoPatch = (
  facility: FacilityLike | null | undefined,
  current: GeoLevels,
): GeoLevels => {
  if (!facility) return {};
  const patch: GeoLevels = {};
  if (blank(current.state) && facility.state) patch.state = facility.state;
  // An LGA or ward only makes sense under the facility's own state.
  const stateAligned = blank(current.state) || current.state === facility.state;
  if (stateAligned && blank(current.lga) && facility.lga) patch.lga = facility.lga;
  const lgaAligned = blank(current.lga) || current.lga === facility.lga;
  if (stateAligned && lgaAligned && blank(current.ward) && facility.ward) patch.ward = facility.ward;
  return patch;
};

/** Short "Kano · Dala · Gwammaja" line for the prefill hint. */
export const facilityGeoLabel = (facility: FacilityLike | null | undefined) =>
  [facility?.state, facility?.lga, facility?.ward].filter(Boolean).join(" · ");
