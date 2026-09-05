// Kotlin: raw triple-quoted strings, string templates, sealed classes.
package demo

import kotlin.math.sqrt

data class Point(val x: Double, val y: Double)

sealed interface Shape {
    fun area(): Double
}

class Circle(val r: Double) : Shape {
    override fun area(): Double = Math.PI * r * r
}

fun main() {
    val p = Point(1.0, 2.0)
    val text = """
        The point $p is at (${p.x}, ${p.y}).
        """ /* trailing block comment */
    val shapes: List<Shape> = listOf(Circle(2.0))
    println(text)
    for (s in shapes) println("area = ${s.area()}")
}
