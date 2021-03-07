// sync with server
export default function pingFilter(row, crit, boolExpr) {
    // TODO: check boolExpr
    if (crit.includedTags.length > 0) {
        let valid;
        if (crit.includeType === "some") {
            valid = false;
            row.tags.forEach(tag => {
                if (crit.includedTags.includes(tag)) valid = true;
            });
        } else {
            valid = crit.includedTags.every(tag => row.tags.includes(tag));
        }
        if (!valid) return false;
    }
    if (!row.tags.every(tag => !crit.excludedTags.includes(tag))) return false;
    let rowDate = row.time * 1000;
    if (crit.range.length === 2) {
        if (rowDate < +crit.range[0]) return false;
        if (rowDate > +crit.range[1]) return false;
    }
    if (boolExpr) {
        return taglogic.expr_matches(boolExpr, row.tags.join(" "));
    }
    return true;
}
