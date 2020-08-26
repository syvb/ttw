//! Implementation of the original TagTime algorithim.

// see https://forum.beeminder.com/t/official-reference-implementation-of-the-tagtime-universal-ping-schedule/4282

const UR_PING: u32 = 1184097393;
const IA: u32 = 16807;
const IM_U32: u32 = 2147483647;
const IM_F64: f64 = 2147483647.0;

/// Repersents a state of the RNG, wraps a u32.
/// Since the RNG state is a 31-bit non-zero integer, the leading bit is always zero.
/// Copy/Clone aren't implemented since there shouldn't be a need for them.
#[derive(Debug, PartialEq, Eq)]
pub struct State(u32);

impl State {
    pub fn from_seed(seed: u32) -> Self {
        Self(seed)
    }

    /// ran0 from Numerical Recipes. Has a period of around 2 billion
    pub fn next_state(&mut self) {
        self.0 = IA * self.0 % IM_U32;
    }

    /// Returns a random number drawn from an exponential distribution with the given mean and state.
    fn exp_rand(&self, m: u32) -> f64 {
        -(m as f64) * ((self.0 as f64) / IM_F64).ln()
    }

    /// Returns the integer number of seconds until the next ping.
    fn gap(&self, gap: u32) -> u32 {
        (self.exp_rand(gap).round() as u32).max(1)
    }
}
