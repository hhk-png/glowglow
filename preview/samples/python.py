#!/usr/bin/env python3
"""A small example: f-strings, dataclasses and decorators."""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Point:
    x: float
    y: float
    label: Optional[str] = None


def dist(a: Point, b: Point) -> float:
    dx = a.x - b.x
    dy = a.y - b.y
    return (dx * dx + dy * dy) ** 0.5


def main() -> None:
    p = Point(1.0, 2.0, label="origin")
    q = Point(4.0, 6.0)
    print(f"{p.label or 'p'} -> {q.label or 'q'} = {dist(p, q):.2f}")
    items = [i for i in range(10) if i % 2 == 0]  # even numbers
    assert len(items) == 5
    for name in ("ana", "bob"):
        if name.startswith("a"):
            print(name.upper())
        else:
            continue


if __name__ == "__main__":
    main()
