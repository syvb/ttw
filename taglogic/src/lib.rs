use wasm_bindgen::prelude::*;

mod hash;
mod tt;

#[wasm_bindgen]
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum PingAlg {
    FnvTime,
    TagTime,
}

#[wasm_bindgen]
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub struct PingIntervalData {
    pub seed: u32,
    pub avg_interval: u32,
    pub alg: PingAlg,
}

/// Used to create interval data from JS. `seed` is passed in as a u32, but gets converted to
/// a u64 in the returned struct. Not an associated function since I couldn't get that to work
/// with wasm-bindgen.
#[wasm_bindgen]
pub fn new_ping_interval_data(seed: u32, avg_interval: u32, old_alg: bool) -> PingIntervalData {
    PingIntervalData {
        seed,
        avg_interval,
        alg: if old_alg {
            PingAlg::TagTime
        } else {
            PingAlg::FnvTime
        },
    }
}

/// Returns if a ping should occur at a given timestamp.
pub fn should_ping_at_time(time: u64, interval_data: &PingIntervalData) -> bool {
    match interval_data.alg {
        PingAlg::FnvTime => {
            let time_hash = hash::time_hash(time, interval_data.seed as u64);
            time_hash < (1.0 / (interval_data.avg_interval as f64))
        }
        PingAlg::TagTime => {
            let mut pung = tt::UR_PING;
            let mut state = tt::State::from_seed(interval_data.seed);
            loop {
                let gap = state.gap(interval_data.avg_interval);
                pung += u64::from(gap);
                if pung > time {
                    println!("Nope, {} seconds off", pung - time);
                    return false;
                } else if pung == time {
                    return true;
                }
                state.next_state();
            }
        }
    }
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

    mod fnv_alg {
        use super::*;

        #[test]
        fn correct_tags_between() {
            assert_eq!(
                pings_between(5, 100, &new_ping_interval_data(1234, 28, false),),
                vec![21, 50, 87]
            )
        }

        #[test]
        #[should_panic]
        fn tags_between_panics_on_bad_range() {
            pings_between(100, 5, &new_ping_interval_data(1234, 28, false));
        }

        #[test]
        fn correct_next_ping() {
            assert_eq!(
                next_ping_after(10000000, &new_ping_interval_data(1234, 1000, false),),
                Some(10001167)
            );
            assert_eq!(
                next_ping_after(0, &new_ping_interval_data(543431, 60000, false),),
                Some(40874)
            );
            assert_eq!(
                next_ping_after(0, &new_ping_interval_data(0, 1, false),),
                Some(1)
            );
        }

        #[test]
        fn next_ping_none_on_overflow() {
            assert_eq!(
                next_ping_after(u64::MAX, &new_ping_interval_data(54224, 1000, false),),
                None
            );
            assert_eq!(
                next_ping_after(
                    u64::MAX - 1000000,
                    &new_ping_interval_data(542432, u32::MAX, false),
                ),
                None
            );
        }

        #[test]
        fn correct_last_ping() {
            assert_eq!(
                last_ping(10000000, &new_ping_interval_data(12352, 1000, false),),
                Some(9999257)
            );
            assert_eq!(
                last_ping(1000, &new_ping_interval_data(1234, 100, false),),
                Some(944)
            );
        }

        #[test]
        fn correct_last_ping_none_on_underflow() {
            assert_eq!(
                last_ping(0, &new_ping_interval_data(1234, 100, false),),
                None
            );
            assert_eq!(
                last_ping(10000, &new_ping_interval_data(387112, 100000, false),),
                None
            );
        }
    }

    mod tagtime_alg {
        use super::*;
        const UNIV_SCHED: PingIntervalData = PingIntervalData {
            seed: 11193462,
            avg_interval: 2700,
            alg: PingAlg::TagTime,
        };

        // see https://tagtime.glitch.me/
        #[test]
        fn correct_should_ping() {
            assert!(should_ping_at_time(1594907790, &UNIV_SCHED));
        }
    }
}
