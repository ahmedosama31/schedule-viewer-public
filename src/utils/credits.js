/**
 * Credit hours utility.
 * Loads the courseCredits.json lookup and computes total credit hours from a schedule.
 */

let creditsCache = null;

export async function loadCreditsData() {
    if (creditsCache) return creditsCache;
    try {
        const res = await fetch('/courseCredits.json');
        if (!res.ok) throw new Error('Failed to load credits data');
        creditsCache = await res.json();
        return creditsCache;
    } catch (err) {
        console.error('Failed to load credits data:', err);
        return {};
    }
}

function lookupCredits(code, creditsMap) {
    if (code in creditsMap) return { credits: creditsMap[code], matchedAs: code };

    for (let i = code.length - 1; i >= 0; i--) {
        if (!/\d/.test(code[i])) break;
        const pattern = code.substring(0, i) + 'X'.repeat(code.length - i);
        if (pattern in creditsMap) return { credits: creditsMap[pattern], matchedAs: pattern };
        const patternLower = code.substring(0, i) + 'x'.repeat(code.length - i);
        if (patternLower in creditsMap) return { credits: creditsMap[patternLower], matchedAs: patternLower };
    }

    return null;
}

export function computeTotalCredits(schedule, creditsMap) {
    if (!schedule || schedule.length === 0) return { totalCredits: null, hasUnknown: false, breakdown: [] };
    if (!creditsMap || Object.keys(creditsMap).length === 0) return { totalCredits: null, hasUnknown: true, breakdown: [] };

    const seen = new Set();
    const uniqueCourses = [];
    for (const c of schedule) {
        if (!seen.has(c.Code)) {
            seen.add(c.Code);
            uniqueCourses.push(c);
        }
    }

    let total = 0;
    let hasUnknown = false;
    const breakdown = [];

    for (const course of uniqueCourses) {
        const result = lookupCredits(course.Code, creditsMap);
        if (result !== null) {
            total += result.credits;
            breakdown.push({
                code: course.Code,
                name: course.Name,
                credits: result.credits,
                matchedAs: result.matchedAs !== course.Code ? result.matchedAs : null,
            });
        } else {
            hasUnknown = true;
            breakdown.push({
                code: course.Code,
                name: course.Name,
                credits: null,
                matchedAs: null,
            });
        }
    }

    return { totalCredits: total, hasUnknown, breakdown };
}
