//! Implementation of the original TagTime algorithim.

// see https://forum.beeminder.com/t/official-reference-implementation-of-the-tagtime-universal-ping-schedule/4282

/// Effective start of time.
pub const UR_PING: u64 = 1184097393;
pub const UNIV_SCHED: super::PingIntervalData = super::PingIntervalData {
    seed: 11193462,
    avg_interval: 2700, // 45 minutes
    alg: super::PingAlg::TagTime,
};
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
}

mod test {
    #[allow(unused_imports)]
    use super::*; // compiler bug cause it to think this is unused, incorrectly

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
            let gap = state.gap(UNIV_SCHED.avg_interval);
            pung += u64::from(gap);
            assert_eq!(pung, time, "diverged on {}th ping from start", index + 1);
            state.next_state();
        }

    }
}
