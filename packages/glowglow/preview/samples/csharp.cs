// C#: interpolated strings, records, nullable annotations, raw strings.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Demo;

/// <summary>XML doc block comment across lines.</summary>
public record Point(double X, double Y)
{
    public double Distance(Point other)
    {
        double dx = other.X - X; // horizontal delta
        double dy = other.Y - Y;
        return Math.Sqrt(dx * dx + dy * dy);
    }
}

public static class Program
{
    public static void Main(string[] args)
    {
        Point p = new(0xFF, 1e-3);
        string name = "demo";
        Console.WriteLine($"point {p} name {name}"); // interpolated
        var json = """
            {
              "name": "demo",
              "values": [1, 2, 3]
            }
            """;
        Console.WriteLine(json);
        int total = args.Sum(a => a.Length);
        var tags = new List<string> { "a", "b", "c" };
        Console.WriteLine(total + string.Join(", ", tags));
    }
}
