/**
 * Helper to compute search suggestions from catalog products and categories
 */
export function getSearchSuggestions(query, products = [], categories = []) {
  const trimmed = (query || '').trim().toLowerCase();
  if (!trimmed) {
    return { products: [], categories: [], totalProductMatches: 0, hasMatches: false };
  }

  const words = trimmed.split(/\s+/).filter(Boolean);

  const getCombinedText = (p) => {
    const name = (p.name || p.title || '').toLowerCase();
    const cat = (p.category || '').toLowerCase();
    const seller = (p.seller || p.sellerName || '').toLowerCase();
    const materials = (p.materials || '').toLowerCase();
    const desc = (p.description || '').toLowerCase();
    return `${name} ${cat} ${seller} ${materials} ${desc}`;
  };

  const matchesWord = (combined, w) => {
    if (combined.includes(w)) return true;
    if (w === 'wooden' && (combined.includes('wood') || combined.includes('teak') || combined.includes('timber') || combined.includes('walnut'))) return true;
    if (w === 'wood' && (combined.includes('wooden') || combined.includes('teak') || combined.includes('timber') || combined.includes('walnut'))) return true;
    if (w === 'dining' && (combined.includes('table') || combined.includes('tableware') || combined.includes('chair'))) return true;
    if (
      w === 'vintage' &&
      (combined.includes('vintage') || combined.includes('archival') || combined.includes('c. 19') || combined.includes('195') || combined.includes('197'))
    ) {
      return true;
    }
    return false;
  };

  // 1. Strict match: all words match or exact phrase
  const strictMatches = products.filter((p) => {
    const combined = getCombinedText(p);
    if (combined.includes(trimmed)) return true;
    return words.every((w) => matchesWord(combined, w));
  });

  // 2. Relevant fallback: if multi-word query and few strict matches, include products matching major terms
  let allMatches = [...strictMatches];
  if (allMatches.length < 5 && words.length > 1) {
    const existingIds = new Set(allMatches.map((p) => p.id));
    const partialMatches = products.filter((p) => {
      if (existingIds.has(p.id)) return false;
      const combined = getCombinedText(p);
      return words.some((w) => w.length >= 3 && matchesWord(combined, w));
    });
    allMatches = allMatches.concat(partialMatches);
  }

  // Sort: exact matches first, then matching name, then others
  allMatches.sort((a, b) => {
    const aName = (a.name || a.title || '').toLowerCase();
    const bName = (b.name || b.title || '').toLowerCase();
    const aHas = aName.includes(trimmed);
    const bHas = bName.includes(trimmed);
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    return 0;
  });

  // 3. Match categories
  const matchingCategories = categories.filter((c) => {
    const cName = (c.name || '').toLowerCase();
    const cDesc = (c.description || '').toLowerCase();
    return (
      cName.includes(trimmed) ||
      cDesc.includes(trimmed) ||
      words.some((w) => cName.includes(w) || (w === 'dining' && cName.includes('home')))
    );
  });

  const hasMatches = allMatches.length > 0 || matchingCategories.length > 0;

  return {
    products: allMatches.slice(0, 5),
    categories: matchingCategories.slice(0, 3),
    totalProductMatches: allMatches.length,
    hasMatches
  };
}
