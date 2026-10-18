<?php
// PHP: typed properties, arrow functions, block comments, all colours fine.
declare(strict_types=1);

namespace Demo;

/* Multi-line
   block comment example */
final class Point
{
    public function __construct(
        public readonly float $x,
        public readonly float $y,
    ) {}

    # PHP also supports hash comments
    public function dist(self $o): float
    {
        $dx = $o->x - $this->x;
        $dy = $o->y - $this->y;
        return sqrt($dx * $dx + $dy * $dy);
    }
}

$points = [new Point(0xFF, 1e-3), new Point(3.0, 4.0)];
$dists = array_map(fn (Point $p) => $p->dist($points[0]), $points);
echo "hello " . count($dists) . " point(s)\n";
