//! Implementation of the original TagTime algorithm.
// see https://forum.beeminder.com/t/official-reference-implementation-of-the-tagtime-universal-ping-schedule/4282

use std::convert::TryInto;

/// Effective start of time.
pub const UR_PING: u64 = 1184097393;
pub const UNIV_SCHED: super::PingIntervalData = super::PingIntervalData {
    seed: 11193462,
    avg_interval: 2700, // 45 minutes
    alg: super::PingAlg::TagTime,
};
const UNIV_SCHED_LOOKUP_TABLE: &[u8; 6568] = include_bytes!("tt/lookup_tables/univ.bin");
pub const LOOKUP_TABLE_INTERVAL: u64 = 432000; // 5 days, regenerate lookup table when changing
const IA: f64 = 16807.0;
const IM_U32: u32 = 2147483647;
const IM_F64: f64 = 2147483647.0;

/// Repersents a state of the RNG, wraps a u32.
/// Since the RNG state is a 31-bit non-zero integer, the leading bit is always zero.
/// Copy/Clone aren't implemented since there shouldn't be a need for them.
#[derive(Debug, PartialEq, Eq)]
pub struct State(u32);

impl State {
    pub fn from_seed(seed: u32) -> Self {
        assert!(seed > 0);
        assert!(seed < IM_U32);
        Self(seed)
    }

    pub fn from_seed_before(seed: u32, before: u64) -> (Self, u64) {
        if seed == UNIV_SCHED.seed {
            // try to find the state in the lookup table
            // integer division rounds down, which is what we want here
            let item_num = (before - UR_PING) / LOOKUP_TABLE_INTERVAL;
            let item_num_usize: usize = match item_num.try_into() {
                Ok(x) => x,
                Err(_) => return (Self::from_seed(seed), UR_PING),
            };
            let index = item_num_usize * 4; // 4 bytes per item
            if index >= UNIV_SCHED_LOOKUP_TABLE.len() {
                (Self::from_seed(seed), UR_PING)
            } else {
                // 4 bytes of data
                let bytes = UNIV_SCHED_LOOKUP_TABLE.get(index..=(index + 4)).unwrap();
                let state = Self::from_seed(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]));
                let time = UR_PING + (item_num * LOOKUP_TABLE_INTERVAL);
                (state, time)
            }
        } else {
            (Self::from_seed(seed), UR_PING)
        }
    }

    /// ran0 from Numerical Recipes. Has a period of around 2 billion
    pub fn next_state(&mut self) {
        let new_val = (IA * (self.0 as f64)) % IM_F64;
        debug_assert!(new_val > 1.0);
        debug_assert!(new_val < IM_F64);
        self.0 = new_val as u32;
    }

    /// Returns a random number drawn from an exponential distribution with the given mean and state.
    fn exp_rand(&self, m: u32) -> f64 {
        -(m as f64) * ((self.0 as f64) / IM_F64).ln()
    }

    /// Returns the integer number of seconds until the next ping.
    pub fn gap(&self, avg_interval: u32) -> u32 {
        (self.exp_rand(avg_interval).round() as u32).max(1)
    }

    /// Gets the inner RNG value.
    pub fn inner(&self) -> u32 {
        self.0
    }
}

mod test {
    #[allow(unused_imports)]
    use super::*; // compiler bug cause it to think this is unused, incorrectly

    #[test]
    fn exp_rand() {
        // valid value determined by using JS refrence implementation functions
        let state = State::from_seed(UNIV_SCHED.seed);
        assert_eq!(state.exp_rand(2700), 14193.149888904356);
    }

    #[test]
    fn exp_rand_100k() {
        /*
            var x = "";
            var state = 11193462; // seed
            var IA = 16807;
            var IM = 2147483647;
            function lcg() { return state = IA * state % IM }
            function exprand(m) { return -m * Math.log(lcg()/IM) }
            for (let i = 0; i < 100_000; i++) { x += exprand(2700) + "\n" }
            console.log(x);
        */
        let lines = include_str!("exprand_100k.txt");
        let val_iter = lines
            .split_ascii_whitespace()
            .filter(|line| !line.is_empty())
            .map(|line| line.parse::<f32>().unwrap())
            .enumerate();
        let mut state = State(11193462);
        for (index, expected_val) in val_iter {
            state.next_state();
            // using f32 quells issues with slightly different decimal stringification
            assert_eq!(
                state.exp_rand(2700) as f32,
                expected_val,
                "diverged on {}th call",
                index + 1
            );
        }
    }

    #[test]
    fn gap_matches_100k() {
        /*
            On https://tagtime.glitch.me
            var x = "";
            init(URPING);
            for (let i = 0; i < 1000; i++) { x += gap() + "\n" }
            console.log(x);
        */
        let lines = include_str!("gaps_100k.txt");
        let val_iter = lines
            .split_ascii_whitespace()
            .filter(|line| !line.is_empty())
            .map(|line| line.parse::<f32>().unwrap())
            .enumerate();
        let mut state = State(11193462);
        for (index, expected_val) in val_iter {
            state.next_state();
            // using f32 quells issues with slightly different decimal stringification
            assert_eq!(
                state.gap(2700) as f32,
                expected_val,
                "diverged on {}th call",
                index + 1
            );
        }
    }

    #[test]
    fn next_state_matches_100k() {
        let mut state = State(1);
        /*
            Generating:
            var x = "";
            var state = 1;
            var IA = 16807;
            var IM = 2147483647;
            function lcg() { return state = IA * state % IM }
            for (let i = 0; i < 100000; i++) { x += lcg() + "\n"; }
            console.log(x)
        */
        let lines = include_str!("lcg_100k.txt");
        let val_iter = lines
            .split_ascii_whitespace()
            .filter(|line| !line.is_empty())
            .map(|line| State(line.parse::<u32>().unwrap()))
            .enumerate();
        for (index, expected_state) in val_iter {
            state.next_state();
            assert_eq!(state, expected_state, "diverged on {}th call", index + 1);
        }
    }

    #[test]
    fn correct_first_pings() {
        // on https://tagtime.glitch.me/ run:
        // var x = ""; init(URPING); for (let i = 0; i < 250; i++) { x += nextping() + "\n" }; console.log(x)
        let lines = include_str!("tagtime_first_250.txt");
        let time_iter = lines
            .split_ascii_whitespace()
            .filter(|line| !line.is_empty())
            .map(|line| line.parse::<u64>().unwrap())
            .enumerate();
        let mut pung = UR_PING;
        let mut state = State::from_seed(UNIV_SCHED.seed);
        for (index, time) in time_iter {
            // initial ping not included in test file
            state.next_state();
            let gap = state.gap(UNIV_SCHED.avg_interval);
            pung += u64::from(gap);
            assert_eq!(pung, time, "diverged on {}th ping from start", index + 1);
        }
    }
}
