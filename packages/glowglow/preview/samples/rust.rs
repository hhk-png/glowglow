//! rust sample — no language argument needed.
//! Types, macros, traits and lifetimes are still readable.

use std::collections::HashMap;

/// A 2-D point.
#[derive(Debug, Clone, Copy)]
struct Point {
    x: f64,
    y: f64,
}

impl Point {
    fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    fn norm(self) -> f64 {
        (self.x * self.x + self.y * self.y).sqrt()
    }
}

fn main() {
    let mut cache: HashMap<String, u32> = HashMap::new();
    cache.insert("a".to_string(), 0xFF);
    cache.entry("b".to_string()).or_insert(1_000);

    let pts = vec![Point::new(0.5, 1.0), Point::new(3.0, 4.0)];
    let total: f64 = pts.iter().map(|p| p.norm()).sum();

    for (k, v) in cache.iter() {
        if let Some(first) = k.chars().next() {
            println!("{first}: {v} (total {total})");
        } else {
            continue;
        }
    }
}
