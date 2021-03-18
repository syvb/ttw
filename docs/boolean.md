# Using boolean filters

This is a guide to using boolean fitlers in TagTime Web. Source code for filters are written in `monospace`.

## Usage

Boolean filters are executed against pings, and either match or don't match. The simplest possible filter is `foo`, which matches all pings that are tagged with `foo`, even if they also have other tags.

Building on this, `!foo` matches all pings *without* `foo`: the NOT operator, `!` negates whatever comes next.

You can combine multiple tags by using the `&`/`and` operator. `foo and bar` is the same as `foo & bar`, and matches pings tagged with `foo` and `bar`. `|`/`or` is the OR operator: `foo | bar` is the same as `foo or bar`, and matches pings tagged with `foo` or `bar` or both.

You can use brackets to specify more complex expressions. `foo & (bar | baz)` matches pings tagged with `foo` and `bar`, pings tagged with `foo` and `baz`, and pings tagged with `foo`, `bar`, and `baz`.

Brackets are implictly added around the largest possible subexpression. `a & b | c` is treated as `a & (b | c)`.

## Examples

| Query                                  | Explanation                                    |
|----------------------------------------|------------------------------------------------|
| `distracted and (hn or twitter or fb)` | Time distracted on social media                |
| `phone & !email`                       | Usage of phone for something other than email  |
| `work & distracted & !lunch`           | Time distracted at work (excluding lunch time) |
| `(gaming & coding) or (ai & research)` | Game programming or ai research                |
