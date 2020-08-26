extern crate taglogic;

use std::io::{self, Write};

fn main() {
    let interval_data = taglogic::tt::UNIV_SCHED;
    let mut time = taglogic::tt::UR_PING;
    let mut state = taglogic::tt::State::from_seed(interval_data.seed);
    let mut pung = taglogic::tt::UR_PING;
    let mut bytes = Vec::new();
    loop {
        loop {
            state.next_state();
            let gap = state.gap(interval_data.avg_interval);
            pung += u64::from(gap);
            if pung > time {
                break;
            };
        }
        bytes.extend_from_slice(&pung.to_le_bytes());
        bytes.extend_from_slice(&state.inner().to_le_bytes());
        time += taglogic::tt::LOOKUP_TABLE_INTERVAL;
        if time > 1893387600 {
            // 2026 in UTC
            break;
        };
    }
    let mut out = io::stdout();
    out.write_all(&bytes).expect("Failed to write output");
    out.flush().expect("Failed to flush output");
}