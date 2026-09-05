// C++: namespaces, templates, lambdas, raw strings and block comments.
#include <algorithm>
#include <iostream>
#include <vector>
#include <string>

namespace demo {

/* Base class with a pure virtual method */
class Shape {
public:
    virtual double area() const = 0; // pure virtual
    virtual ~Shape() = default;
};

class Circle final : public Shape {
public:
    explicit Circle(double r) : r_(r) {}
    double area() const override { return 3.14159 * r_ * r_; }

private:
    double r_;
};

template <typename T>
T sum(const std::vector<T>& xs) {
    return std::accumulate(xs.begin(), xs.end(), T{0});
}

} // namespace demo

int main() {
    std::vector<demo::Circle> circles{};
    auto area = [](const auto& s) { return s.area(); }; // lambda
    std::string html = R"(<p>raw string & stays as-is</p>)";
    std::cout << html << "\n";
    return 0;
}
