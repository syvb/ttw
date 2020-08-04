use std::time;
use wasm_bindgen::prelude::*;
mod hash;

/// Utility function for getting the current Unix time as a u64.
fn cur_unix_time() -> u64 {
    time::SystemTime::now()
        .duration_since(time::UNIX_EPOCH)
        .expect("Failed to get Unix time: system clock is set to a time before Jan. 1 1970")
        .as_secs()
}

#[wasm_bindgen]
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct PingIntervalData {
    pub seed: u32,
    pub avg_interval: u32,
}

/// Used to create interval data from JS. `seed` is passed in as a u32, but gets converted to
/// a u64 in the returned struct. Not an associated function since I couldn't get that to work
/// with wasm-bindgen.
#[wasm_bindgen]
pub fn new_ping_interval_data(seed: u32, avg_interval: u32) -> PingIntervalData {
    PingIntervalData {
        seed,
        avg_interval,
    }
}

/// Returns if a ping should occur at a given timestamp.
pub fn should_ping_at_time(time: u64, interval_data: &PingIntervalData) -> bool {
    let time_hash = hash::time_hash(time, interval_data.seed as u64);
    time_hash < (1.0 / (interval_data.avg_interval as f64))
}

#[wasm_bindgen]
pub fn should_ping_at_time_u32(time: u32, interval_data: &PingIntervalData) -> bool {
    should_ping_at_time(time as u64, interval_data)
}

/// Returns the next ping **after** a given timestamp. Returns None if there will never be another ping
/// with a time repersentable as a u64. (although this should only occur if the average interval is *really* high).
pub fn next_ping_after(mut t: u64, interval_data: &PingIntervalData) -> Option<u64> {
    // NonZeroU64 isn't supported by wasm_bindgen, so we use a normal u64 (although zero will never be returned)
    loop {
        // if we fail to add one to the initial time, then the former time must have been the max
        // u64 value, and therefore the next ping would be out of bounds (or never), so we return
        // None in that case
        t = t.checked_add(1)?;
        if should_ping_at_time(t, interval_data) {
            return Some(t);
        };
    }
}

#[wasm_bindgen]
pub fn next_ping_after_u32(t: u32, interval_data: &PingIntervalData) -> Option<u32> {
    next_ping_after(t as u64, interval_data).map(|n| n as u32) // fails after 2106
}

/// Returns the next ping **before** a given timestamp. Returns None if there never was another earlier ping
/// with a time repersentable as a u64. (although this should only occur if the average interval is *really* high).
pub fn last_ping(mut t: u64, interval_data: &PingIntervalData) -> Option<u64> {
    loop {
        // if we fail to add one to the initial time, then the former time must have been the max
        // u64 value, and therefore the next ping would be out of bounds (or never), so we return
        // None in that case
        t = t.checked_sub(1)?;
        if t == 0 {
            return None;
        };
        if should_ping_at_time(t, &interval_data) {
            return Some(t);
        };
    }
}

#[wasm_bindgen]
pub fn last_ping_u32(t: u32, interval_data: &PingIntervalData) -> Option<u32> {
    last_ping(t as u64, interval_data).map(|n| n as u32) // fails after 2106
}

/// Returns all pings between two specified times.
///
/// ## Panics
/// Panics if t1 is less than t2.
pub fn pings_between(t1: u64, t2: u64, interval_data: &PingIntervalData) -> Vec<u64> {
    assert!(
        t1 < t2,
        "t1 must be less than t2, since t1 and t2 specify a range."
    );
    let mut pings = Vec::with_capacity(1);
    for t in t1..=t2 {
        if should_ping_at_time(t, &interval_data) {
            pings.push(t);
        };
    }
    pings.shrink_to_fit();
    pings
}

#[wasm_bindgen]
pub fn pings_between_u32(t1: u32, t2: u32, interval_data: &PingIntervalData) -> Vec<u32> {
    pings_between(t1 as u64, t2 as u64, interval_data)
        .iter()
        .map(|n| *n as u32)
        .collect() // fails after 2106
}

#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console-panic")]
    {
        console_error_panic_hook::set_once();
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn correct_tags_between() {
        assert_eq!(
            pings_between(
                5,
                100,
                &PingIntervalData {
                    seed: 1234,
                    avg_interval: 28,
                }
            ),
            vec![21, 50, 87]
        )
    }

    #[test]
    #[should_panic]
    fn tags_between_panics_on_bad_range() {
        pings_between(
            100,
            5,
            &PingIntervalData {
                seed: 1234,
                avg_interval: 28,
            },
        );
    }

    #[test]
    fn correct_next_ping() {
        assert_eq!(
            next_ping_after(
                10000000,
                &PingIntervalData {
                    seed: 1234,
                    avg_interval: 1000,
                }
            ),
            Some(10001167)
        );
        assert_eq!(
            next_ping_after(
                0,
                &PingIntervalData {
                    seed: 543431,
                    avg_interval: 60000,
                }
            ),
            Some(40874)
        );
        assert_eq!(
            next_ping_after(
                0,
                &PingIntervalData {
                    seed: 0,
                    avg_interval: 1,
                }
            ),
            Some(1)
        );
    }

    #[test]
    fn next_ping_none_on_overflow() {
        assert_eq!(
            next_ping_after(
                u64::MAX,
                &PingIntervalData {
                    seed: 54224,
                    avg_interval: 1000,
                }
            ),
            None
        );
        assert_eq!(
            next_ping_after(
                u64::MAX - 1000000,
                &PingIntervalData {
                    seed: 542432,
                    avg_interval: u32::MAX,
                }
            ),
            None
        );
    }

    #[test]
    fn correct_last_ping() {
        assert_eq!(
            last_ping(
                10000000,
                &PingIntervalData {
                    seed: 12352,
                    avg_interval: 1000,
                }
            ),
            Some(9999257)
        );
        assert_eq!(
            last_ping(
                1000,
                &PingIntervalData {
                    seed: 1234,
                    avg_interval: 100,
                }
            ),
            Some(944)
        );
    }

    #[test]
    fn correct_last_ping_none_on_underflow() {
        assert_eq!(
            last_ping(
                0,
                &PingIntervalData {
                    seed: 1234,
                    avg_interval: 100,
                }
            ),
            None
        );
        assert_eq!(
            last_ping(
                10000,
                &PingIntervalData {
                    seed: 387112,
                    avg_interval: 100000,
                }
            ),
            None
        );
    }
}
