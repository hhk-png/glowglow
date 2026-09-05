// Swift: optionals, multiline strings, protocol + extension.
import Foundation

/// A documentation block comment
/// that also spans multiple lines.
struct Point {
    var x: Double
    var y: Double
}

protocol Shape {
    func area() -> Double
}

struct Circle: Shape {
    let radius: Double
    func area() -> Double { Double.pi * radius * radius }
}

func describe(_ shapes: [Shape]) {
    for shape in shapes {
        let label = """
            This shape covers an area
            of roughly \(shape.area()) units².
            """
        print(label)
    }
}

let circle = Circle(radius: 2.0)
describe([circle])
