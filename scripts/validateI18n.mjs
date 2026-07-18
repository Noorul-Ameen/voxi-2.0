import assert from "node:assert/strict";
import { STRINGS } from "../src/i18n/strings.js";

const englishKeys = Object.keys(STRINGS.en).sort();
const arabicKeys = Object.keys(STRINGS.ar).sort();
assert.deepEqual(arabicKeys, englishKeys, "English and Arabic dictionaries must have identical keys");
assert.ok(englishKeys.length >= 100, "the complete UI dictionary is expected");
for (const locale of ["en", "ar"]) {
  for (const [key, value] of Object.entries(STRINGS[locale])) {
    assert.ok(String(value).trim(), `${locale}.${key} must not be empty`);
  }
}
assert.ok(Object.values(STRINGS.ar).some((value) => /[\u0600-\u06ff]/.test(value)), "Arabic copy must contain Arabic text");

console.log(`Validated ${englishKeys.length} matching English/Arabic UI strings.`);

