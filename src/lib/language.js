// Heuristic language detection — "is this English or close enough?"
//
// Used to drop non-English items from the brief without requiring an LLM /
// translation API. Two layers:
//   1. Hard reject: any non-Latin script (CJK / Cyrillic / Arabic / Hebrew /
//      Thai / Devanagari / Greek). Almost certainly non-English.
//   2. Soft reject: Latin-script content with high density of non-English
//      stop words (Spanish "que/para", Portuguese "não", French "le/les",
//      German "der/die/das", Italian "del/della") OR high diacritic density.
//
// Bias is toward INCLUSION — we'd rather show one slightly-mixed-language
// item than drop a real story because of one accented proper noun.

const NON_LATIN_SCRIPT = /[぀-ヿ㐀-鿿가-힯Ѐ-ӿԀ-ԯ֐-׿؀-ۿऀ-ॿ฀-๿Ͱ-Ͽ]/;

// Word boundaries in JS regex don't handle Unicode well — use space-separated
// matching instead. Lowercased before testing.
const FOREIGN_STOPWORDS = {
  es: /(?:^|\s)(que|para|por|con|los|las|del|una?|este|sus?|también|según|hacia|desde|cuando|porque|mientras|aunque|hasta)(?:\s|[.,;:!?]|$)/,
  pt: /(?:^|\s)(não|para|com|uma?|este|sua|também|porque|quando|mais|enquanto|sobre|através|desde|pelo|pela|sendo)(?:\s|[.,;:!?]|$)/,
  fr: /(?:^|\s)(les|des|une|cette|leurs|aussi|aux|dans|pour|avec|plus|sont|était|étaient|peut|tout|chez|quand)(?:\s|[.,;:!?]|$)/,
  de: /(?:^|\s)(der|die|das|und|ist|sind|nicht|auch|eine?|seine?|werden|wurde|durch|nach|über|unter|gegen|zwischen)(?:\s|[.,;:!?]|$)/,
  it: /(?:^|\s)(degli|delle|della|dello|nello|nella|questo|questa|anche|però|quando|sono|essere|nostra|nostro)(?:\s|[.,;:!?]|$)/,
};

export function isLikelyEnglish(text) {
  if (!text) return true; // empty doesn't fail-closed
  const sample = String(text).slice(0, 800);

  // Hard reject: non-Latin script present.
  if (NON_LATIN_SCRIPT.test(sample)) return false;

  const lower = sample.toLowerCase();

  // Count distinct foreign-stop-word hits across languages. A single match
  // could be a proper noun ("Le Monde"); we require 2+ for a soft reject.
  let foreignLangsHit = 0;
  for (const re of Object.values(FOREIGN_STOPWORDS)) {
    if (re.test(lower)) foreignLangsHit++;
  }
  // 2+ different language signals → definitely not English.
  if (foreignLangsHit >= 2) return false;

  // 1 language signal + high diacritic density → also reject.
  if (foreignLangsHit >= 1) {
    const diacritics = (sample.match(/[à-üÀ-Üñçèéêëîïôöüßãõ]/g) || []).length;
    if (diacritics / sample.length > 0.02) return false;
  }

  // Very high diacritic density alone (>5%) is enough — that's stronger than
  // even English text with foreign names usually shows.
  const diacritics = (sample.match(/[à-üÀ-Üñçèéêëîïôöüßãõ]/g) || []).length;
  if (sample.length > 30 && diacritics / sample.length > 0.05) return false;

  return true;
}

// Convenience for items — checks title + summary together.
export function itemIsLikelyEnglish(item) {
  const blob = `${item.title || ""} ${item.summary || ""}`;
  return isLikelyEnglish(blob);
}
