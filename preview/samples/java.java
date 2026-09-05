// Java: block comments, text blocks (multiline strings), annotations.
package com.example.demo;

import java.util.List;   // single-line comment
import java.util.Map;

/**
 * JavaDoc block comment that spans several lines.
 * @author demo
 */
public record Point(int x, int y) {

    public double dist(Point o) {
        double dx = o.x - x; // horizontal delta
        double dy = o.y - y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    public static void main(String[] args) {
        Point p = new Point(0xFF, 1);
        String sql = """
                SELECT name, score
                FROM users
                WHERE score >= 10
                """;
        List<Map<String, Object>> rows = List.of(Map.of("name", "ana", "score", 10));
        System.out.println(sql + rows + p.dist(new Point(3, 4)));
    }
}
