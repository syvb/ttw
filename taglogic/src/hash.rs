use std::hash::Hasher;

const U64_MAX_FLOAT: f64 = u64::MAX as f64;

/// Uses FNV hashing to map input times to randomly distributed numbers.
pub fn time_hash(t: u64, seed: u64) -> f64 {
    let mut hasher = fnv::FnvHasher::with_key(seed);
    // write_u64 isn't used since that uses the native endianness.
    // Instead, we always use little-endian for hashing purposes, since most CPUs are
    // little-endian anyways, and most big-endian processors are old and slow anyways.
    hasher.write(&t.to_le_bytes());
    let hash: u64 = hasher.finish();
    (hash as f64) / U64_MAX_FLOAT
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn time_hash_valid() {
        assert_eq!(time_hash(1000000, 123), 0.7658504836526976);
    }

    #[test]
    fn all_time_hash_in_range() {
        #[inline]
        fn check_hash(t: u64, seed: u64) {
            let hash = time_hash(t, seed);
            if hash >= 1.0 || hash < 0.0 {
                panic!("time_hash({}, {}) = {}", t, seed, hash);
            };
        }

        for seed in &[0, 1, 893784943, u64::MAX - 1, u64::MAX] {
            for i in 0..100000 {
                check_hash(i, *seed);
            }
            for i in (u64::MAX - 10000)..u64::MAX {
                check_hash(i, *seed);
            }
        }
    }
}
