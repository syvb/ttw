# Using boolean filters

This is a guide to using boolean fitlers in TagTime Web. Source code forfilters are written in `monospace`.

Boolean filters are executed against pings, and either match or don't match. The simplest possible filter is `foo`, which matches all pings that are tagged with `foo`, even if they also have other tags.

Building on this, `!foo` matches all pings *without* `foo`: the NOT operator, `!` negates whatever comes next.

You can combine multiple tags by using the `&`/`and` operator. `foo and bar` is the same as `foo & bar`, and matches pings tagged with `foo` and `bar`. `|`/`or` is the OR operator: `foo | bar` is the same as `foo or bar`, and matches pings tagged with `foo` or `bar` or both.

You can use brackets to specify more complex expressions. `foo & (bar | baz)` matches pings tagged with `foo` and `bar`, pings tagged with `foo` and `baz`, and pings tagged with `foo`, `bar`, and `baz`.

Brackets are implictly added around the largest possible subexpression. `a & b | c` is treated as `a & (b | c)`.
