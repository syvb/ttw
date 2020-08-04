extern crate taglogic;

fn main() {
    println!("Checking stats about taglogic algos");
    {
        let mut pings = 0;
        for seed in 1000000..1010000 {
            let pung = taglogic::should_ping_at_time(
                12345678,
                &taglogic::new_ping_interval_data(seed, 10),
            );
            if pung {
                pings += 1;
            };
        }
        println!("Test 1: pung {} times, should be near 1000.", pings);
    }
    {
        let pid = taglogic::new_ping_interval_data(23456789, 1000);
        let mut actual_intervals = Vec::with_capacity(10000);
        let mut last = 1;
        for _ in 0..10000 {
            let next = taglogic::next_ping_after(last, &pid).expect("failed to get next ping");
            let interval = next - last;
            actual_intervals.push(interval);
            last = next;
        }
        let avg: u64 = actual_intervals.iter().sum::<u64>() / 10000;
        println!("Test 2: average interval was {}, should be near 1000.", avg);
    }
}
