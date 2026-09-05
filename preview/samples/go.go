// Package main shows off the glowglow engine with zero config.
package main

import (
	"fmt"
	"math"
	"os"
	"strings"
)

type point struct {
	X, Y float64
}

// dist returns the euclidean distance between two points.
func dist(a, b point) float64 {
	dx := a.X - b.X // horizontal delta
	dy := a.Y - b.Y
	return math.Sqrt(dx*dx + dy*dy)
}

func main() {
	p := point{X: 0xFF, Y: 1e-3}
	fmt.Printf("p = %+v\n", p)
	words := strings.Fields("go is fun")
	for _, w := range words { /* range over slice */
		fmt.Println(w)
	}
	total := 0
	for i := 0; i < 10; i++ {
		total += i
	}
	if total > 40 {
		os.Exit(0)
	}
}
