/** Older school records store contact metadata as JSON in schools.address.
 * A document must print only the address, never that entire metadata object. */
export function printableSchoolAddress(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  let address: unknown = value;
  if (typeof address === "string") {
    const text = address.trim();
    if (!text.startsWith("{") && !text.startsWith("[")) return text.normalize("NFC");
    try {
      address = JSON.parse(text);
    } catch {
      throw new Error("Adresa ustanove nije ispravno zapisana. Provjerite adresu u postavkama škole.");
    }
  }
  if (typeof address === "object" && address !== null && !Array.isArray(address)) {
    const street = (address as Record<string, unknown>).address;
    if (typeof street === "string") return street.trim().normalize("NFC");
  }
  throw new Error("Adresa ustanove nije ispravno zapisana. Provjerite adresu u postavkama škole.");
}
