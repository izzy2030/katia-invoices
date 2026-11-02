export interface DecodedVehicle {
  year: string;
  make: string;
  model: string;
  trim?: string;
  bodyClass?: string;
  engine?: string;
}

/**
 * Formats all-caps manufacturer strings to standard Title Case (e.g. "TOYOTA" -> "Toyota")
 */
export function formatVehicleName(str: string): string {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .split(/([\s/-]+)/)
    .map((word) => {
      if (!word.trim()) return word;
      // Preserve standard acronyms like BMW, GMC, RAM, etc.
      const upper = word.toUpperCase();
      if (
        ['BMW', 'GMC', 'RAM', 'AMG', 'EV', '4WD', 'AWD', 'FWD', 'RWD'].includes(
          upper,
        )
      ) {
        return upper;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join('');
}

/**
 * Decodes a 17-character VIN using the official US Government NHTSA vPIC REST API.
 * 100% free, zero API keys required, works for all US/North American vehicles.
 */
export async function decodeVin(vin: string): Promise<DecodedVehicle> {
  const cleanVin = vin
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (cleanVin.length !== 17) {
    throw new Error('VIN must be exactly 17 characters.');
  }

  const response = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(cleanVin)}?format=json`,
  );

  if (!response.ok) {
    throw new Error(`NHTSA lookup failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    Results?: Array<Record<string, string>>;
  };

  const result = data?.Results?.[0];
  if (!result) {
    throw new Error('No vehicle information found for this VIN.');
  }

  // Check if NHTSA returned any valid data
  const rawMake = result.Make?.trim() || '';
  const rawModel = result.Model?.trim() || '';
  const rawYear = result.ModelYear?.trim() || '';

  if (!rawMake && !rawModel && !rawYear) {
    throw new Error(result.ErrorText || 'Invalid or unrecognized VIN.');
  }

  const year = rawYear;
  const make = formatVehicleName(rawMake);
  const baseModel = formatVehicleName(rawModel);
  const trim = result.Trim ? result.Trim.trim() : '';
  const model =
    trim && !baseModel.toLowerCase().includes(trim.toLowerCase())
      ? `${baseModel} ${trim}`
      : baseModel;

  const engine = result.DisplacementL
    ? `${result.DisplacementL}L ${result.EngineCylinders ? `${result.EngineCylinders}-cyl` : ''}`.trim()
    : undefined;

  return {
    year,
    make,
    model,
    trim: trim || undefined,
    bodyClass: result.BodyClass?.trim() || undefined,
    engine,
  };
}
